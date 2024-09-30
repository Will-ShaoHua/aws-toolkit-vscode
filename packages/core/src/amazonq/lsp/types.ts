/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestType } from 'vscode-languageserver'

export type IndexRequestPayload = {
    filePaths: string[]
    rootPath: string
    refresh: boolean
}

export type IndexRequest = string

export const IndexRequestType: RequestType<IndexRequest, any, any> = new RequestType('lsp/index')

export type ClearRequest = string

export const ClearRequestType: RequestType<ClearRequest, any, any> = new RequestType('lsp/clear')

export type QueryRequest = string

export const QueryRequestType: RequestType<QueryRequest, any, any> = new RequestType('lsp/query')

export type UpdateIndexRequest = string

export const UpdateIndexRequestType: RequestType<UpdateIndexRequest, any, any> = new RequestType('lsp/updateIndex')

export type GetUsageRequest = string

export const GetUsageRequestType: RequestType<GetUsageRequest, any, any> = new RequestType('lsp/getUsage')

export interface Usage {
    memoryUsage: number
    cpuUsage: number
}

export type BuildIndexRequestPayload = {
    filePaths: string[]
    projectRoot: string
    config: string
    language: string
}

export type BuildIndexRequest = string

export const BuildIndexRequestType: RequestType<BuildIndexRequest, any, any> = new RequestType('lsp/buildIndex')

export type UpdateIndexV2Request = string

export type UpdateIndexV2RequestPayload = { filePaths: string[]; updateMode: string }

export const UpdateIndexV2RequestType: RequestType<UpdateIndexV2Request, any, any> = new RequestType(
    'lsp/updateIndexV2'
)

export type QueryBM25IndexRequest = string

export type QueryBM25IndexRequestPayload = {
    query: string
    filePath: string
}

export const QueryBM25IndexRequestType: RequestType<QueryBM25IndexRequest, any, any> = new RequestType(
    'lsp/queryBm25Index'
)

export type QueryVectorIndexRequestPayload = { query: string }

export type QueryVectorIndexRequest = string

export const QueryVectorIndexRequestType: RequestType<QueryVectorIndexRequest, any, any> = new RequestType(
    'lsp/queryVectorIndex'
)

export type QueryCodeMapIndexRequest = string

export type QueryCodeMapIndexRequestPayload = { filePath: string }

export const QueryCodeMapIndexRequestType: RequestType<QueryCodeMapIndexRequest, any, any> = new RequestType(
    'lsp/queryCodeMapIndex'
)
