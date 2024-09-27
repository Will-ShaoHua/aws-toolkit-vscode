/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/*!
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 */
import * as vscode from 'vscode'
import * as path from 'path'
import * as nls from 'vscode-nls'
import * as cp from 'child_process'
import * as crypto from 'crypto'
import * as jose from 'jose'

import { Disposable, ExtensionContext } from 'vscode'

import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient'
import {
    BuildIndexRequestPayload,
    BuildIndexRequestType,
    GetUsageRequestType,
    IndexRequestType,
    QueryBM25IndexRequestType,
    QueryCodeMapIndexRequestType,
    QueryRequestType,
    QueryVectorIndexRequestType,
    UpdateIndexRequestType,
    UpdateIndexV2RequestPayload,
    UpdateIndexV2RequestType,
    Usage,
} from './types'
import { Writable } from 'stream'
import { CodeWhispererSettings } from '../../codewhisperer/util/codewhispererSettings'
import { fs, getLogger } from '../../shared'

const localize = nls.loadMessageBundle()

const key = crypto.randomBytes(32)

/**
 * Sends a json payload to the language server, who is waiting to know what the encryption key is.
 * Code reference: https://github.com/aws/language-servers/blob/7da212185a5da75a72ce49a1a7982983f438651a/client/vscode/src/credentialsActivation.ts#L77
 */
export function writeEncryptionInit(stream: Writable): void {
    const request = {
        version: '1.0',
        mode: 'JWT',
        key: key.toString('base64'),
    }
    stream.write(JSON.stringify(request))
    stream.write('\n')
}
/**
 * LspClient manages the API call between VS Code extension and LSP server
 * It encryptes the payload of API call.
 */
export class LspClient {
    static #instance: LspClient
    client: LanguageClient | undefined

    public static get instance() {
        return (this.#instance ??= new this())
    }

    constructor() {
        this.client = undefined
    }

    async encrypt(payload: string) {
        return await new jose.CompactEncrypt(new TextEncoder().encode(payload))
            .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
            .encrypt(key)
    }

    async indexFiles(request: string[], rootPath: string, refresh: boolean) {
        try {
            const encryptedRequest = await this.encrypt(
                JSON.stringify({
                    filePaths: request,
                    rootPath: rootPath,
                    refresh: refresh,
                })
            )
            const resp = await this.client?.sendRequest(IndexRequestType, encryptedRequest)
            return resp
        } catch (e) {
            getLogger().error(`LspClient: indexFiles error: ${e}`)
            return undefined
        }
    }

    // todo: maynot need language? or it should send language[] instead
    // v2
    async indexFilesV2(paths: string[], rootPath: string) {
        const language = vscode.window.activeTextEditor?.document.languageId ?? 'plaintext'
        const payload: BuildIndexRequestPayload = {
            filePaths: paths,
            projectRoot: rootPath,
            config: 'all',
            language: language,
        }
        try {
            const encryptedRequest = await this.encrypt(JSON.stringify(payload))
            const resp = await this.client?.sendRequest(BuildIndexRequestType, encryptedRequest)
            return resp
        } catch (e) {
            getLogger().error(`LspClient: indexFilesV2 error: ${e}`)
            return undefined
        }
    }

    async query(request: string) {
        try {
            const encryptedRequest = await this.encrypt(
                JSON.stringify({
                    query: request,
                })
            )
            const resp = await this.client?.sendRequest(QueryRequestType, encryptedRequest)
            return resp
        } catch (e) {
            getLogger().error(`LspClient: query error: ${e}`)
            return []
        }
    }

    async queryV2(query: string, target: 'bm25' | 'vector' | 'codemap') {
        try {
            let request: string = ''
            if (target === 'codemap') {
                request = JSON.stringify({
                    filePath: query,
                })
            } else {
                request = JSON.stringify({
                    query: query,
                })
            }

            const encrpted = await this.encrypt(request)

            let resp: any = {}
            switch (target) {
                case 'bm25':
                    resp = await this.client?.sendRequest(QueryBM25IndexRequestType, encrpted)
                    break
                case 'vector':
                    resp = await this.client?.sendRequest(QueryVectorIndexRequestType, encrpted)
                    break
                case 'codemap':
                    resp = await this.client?.sendRequest(QueryCodeMapIndexRequestType, encrpted)
                    break
                default:
                    throw new Error(`invalid target: ${target}`)
            }

            return resp
        } catch (e) {
            getLogger().error(`LspClient: query error: ${e}`)
            return []
        }
    }

    async getLspServerUsage(): Promise<Usage | undefined> {
        if (this.client) {
            return (await this.client.sendRequest(GetUsageRequestType, '')) as Usage
        }
    }

    async updateIndex(filePath: string) {
        try {
            const encryptedRequest = await this.encrypt(
                JSON.stringify({
                    filePath: filePath,
                })
            )
            const resp = await this.client?.sendRequest(UpdateIndexRequestType, encryptedRequest)
            return resp
        } catch (e) {
            getLogger().error(`LspClient: updateIndex error: ${e}`)
            return undefined
        }
    }

    // not yet account for file move
    // v2
    async updateIndexV2(filePath: string[], mode: 'update' | 'remove' | 'add' | 'rename') {
        const payload: UpdateIndexV2RequestPayload = {
            filePaths: filePath,
            updateMode: mode,
        }
        try {
            const encryptedRequest = await this.encrypt(JSON.stringify(payload))
            const resp = await this.client?.sendRequest(UpdateIndexV2RequestType, encryptedRequest)
            return resp
        } catch (e) {
            getLogger().error(`LspClient: updateIndexV2 error: ${e}`)
            return undefined
        }
    }
}
/**
 * Activates the language server, this will start LSP server running over IPC protocol.
 * It will create a output channel named Amazon Q Language Server.
 * This function assumes the LSP server has already been downloaded.
 */
export async function activate(extensionContext: ExtensionContext) {
    LspClient.instance
    const toDispose = extensionContext.subscriptions

    let rangeFormatting: Disposable | undefined
    // The server is implemented in node
    const serverModule = path.join(extensionContext.extensionPath, 'resources/qserver/lspServer.js')
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = { execArgv: ['--nolazy', '--preserve-symlinks', '--stdio'] }

    const workerThreads = CodeWhispererSettings.instance.getIndexWorkerThreads()
    const gpu = CodeWhispererSettings.instance.isLocalIndexGPUEnabled()

    if (gpu) {
        process.env.Q_ENABLE_GPU = 'true'
    } else {
        delete process.env.Q_ENABLE_GPU
    }
    if (workerThreads > 0 && workerThreads < 100) {
        process.env.Q_WORKER_THREADS = workerThreads.toString()
    } else {
        delete process.env.Q_WORKER_THREADS
    }

    const nodename = process.platform === 'win32' ? 'node.exe' : 'node'

    const child = cp.spawn(extensionContext.asAbsolutePath(path.join('resources', nodename)), [
        serverModule,
        ...debugOptions.execArgv,
    ])
    // share an encryption key using stdin
    // follow same practice of DEXP LSP server
    writeEncryptionInit(child.stdin)

    // If the extension is launch in debug mode the debug server options are use
    // Otherwise the run options are used
    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
    }

    serverOptions = () => Promise.resolve(child!)

    const documentSelector = [{ scheme: 'file', language: '*' }]

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for json documents
        documentSelector,
        initializationOptions: {
            handledSchemaProtocols: ['file', 'untitled'], // language server only loads file-URI. Fetching schemas with other protocols ('http'...) are made on the client.
            provideFormatter: false, // tell the server to not provide formatting capability and ignore the `aws.stepfunctions.asl.format.enable` setting.
            // this is used by LSP to determine index cache path, move to this folder so that when extension updates index is not deleted.
            extensionPath: path.join(fs.getUserHomeDir(), '.aws', 'amazonq', 'cache'),
        },
    }

    // Create the language client and start the client.
    LspClient.instance.client = new LanguageClient(
        'amazonq',
        localize('amazonq.server.name', 'Amazon Q Language Server'),
        serverOptions,
        clientOptions
    )
    LspClient.instance.client.registerProposedFeatures()

    const disposable = LspClient.instance.client.start()
    toDispose.push(disposable)

    let savedDocument: vscode.Uri | undefined = undefined

    toDispose.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            if (document.uri.scheme !== 'file') {
                return
            }
            savedDocument = document.uri
        })
    )
    toDispose.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (savedDocument && editor && editor.document.uri.fsPath !== savedDocument.fsPath) {
                void LspClient.instance.updateIndex(savedDocument.fsPath)
            }
        }),
        vscode.workspace.onDidCreateFiles((e) => {
            void LspClient.instance.updateIndexV2(
                e.files.map((f) => f.fsPath),
                'add'
            )
        }),
        vscode.workspace.onDidDeleteFiles((e) => {
            void LspClient.instance.updateIndexV2(
                e.files.map((f) => f.fsPath),
                'remove'
            )
        }),
        vscode.workspace.onDidRenameFiles((e) => {
            // void LspClient.instance.updateIndexV2(e.files.map((f) => f.newUri.fsPath), 'rename')
        })
    )
    return LspClient.instance.client.onReady().then(() => {
        const disposableFunc = { dispose: () => rangeFormatting?.dispose() as void }
        toDispose.push(disposableFunc)
    })
}

export async function deactivate(): Promise<any> {
    if (!LspClient.instance.client) {
        return undefined
    }
    return LspClient.instance.client.stop()
}
