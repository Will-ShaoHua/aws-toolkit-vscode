/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import { mkdir, writeFile } from '../../shared/filesystem'
import { findFileInParentPaths, mkdtemp } from '../../shared/filesystemUtilities'

describe('filesystemUtilities', () => {
    const targetFilename = 'findThisFile12345.txt'
    let targetFilePath: string
    const nonExistingTargetFilename = 'doNotFindThisFile12345.txt'
    let tempFolder: string

    beforeEach(async () => {
        // Make a temp folder for all these tests
        tempFolder = await mkdtemp()
        targetFilePath = path.join(tempFolder, targetFilename)

        await writeFile(targetFilePath, 'Hello, World!', 'utf8')
    })

    afterEach(async () => {
        await del([tempFolder], { force: true })
    })

    describe('findFileInParentPaths', () => {

        it('returns undefined when file not found', async () => {
            assert.strictEqual(
                await findFileInParentPaths(tempFolder, nonExistingTargetFilename),
                undefined)
        })

        it('finds the file in the same folder', async () => {
            assert.strictEqual(
                await findFileInParentPaths(tempFolder, targetFilename),
                targetFilePath)
        })

        it('finds the file next to another file', async () => {
            const searchLocation = path.join(tempFolder, 'foo.txt')

            assert.strictEqual(
                await findFileInParentPaths(searchLocation, targetFilename),
                targetFilePath)
        })

        it('finds the file in the parent folder', async () => {
            const childFolder = path.join(tempFolder, 'child1')
            await mkdir(childFolder)

            assert.strictEqual(
                await findFileInParentPaths(childFolder, targetFilename),
                targetFilePath)
        })

        it('finds the file 3 parent folders up', async () => {
            let childFolder = path.join(tempFolder, 'child1')
            await mkdir(childFolder)
            childFolder = path.join(tempFolder, 'child2')
            await mkdir(childFolder)
            childFolder = path.join(tempFolder, 'child3')
            await mkdir(childFolder)

            assert.strictEqual(
                await findFileInParentPaths(childFolder, targetFilename),
                targetFilePath)
        })
    })
})
