/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CodewhispererCompletionType,
    CodewhispererLanguage,
    CodewhispererGettingStartedTask,
    CodewhispererSuggestionState,
} from '../../shared/telemetry/telemetry.gen'
import { GenerateRecommendationsRequest, ListRecommendationsRequest } from '../client/codewhisperer'
import { Position } from 'vscode'
import { CodeWhispererSupplementalContext } from './supplementalContext/supplementalContextUtil'
import { Recommendation } from '../models/model'

const performance = globalThis.performance ?? require('perf_hooks').performance

class CodeWhispererSession {
    static #instance: CodeWhispererSession

    // Per-session states
    sessionId = ''
    requestIdList: string[] = []
    startPos = new Position(0, 0)
    leftContextOfCurrentLine = ''
    requestContext: {
        request: ListRecommendationsRequest | GenerateRecommendationsRequest
        supplementalMetadata: Omit<CodeWhispererSupplementalContext, 'supplementalContextItems'> | undefined
    } = { request: {} as any, supplementalMetadata: {} as any }
    language: CodewhispererLanguage = 'java'
    taskType: CodewhispererGettingStartedTask | undefined
    // Various states of recommendations
    recommendations: Recommendation[] = []

    // Some other variables for client component latency
    fetchCredentialStartTime = 0
    sdkApiCallStartTime = 0
    invokeSuggestionStartTime = 0

    public static get instance() {
        return (this.#instance ??= new CodeWhispererSession())
    }

    setFetchCredentialStart() {
        if (this.fetchCredentialStartTime === 0 && this.invokeSuggestionStartTime !== 0) {
            this.fetchCredentialStartTime = performance.now()
        }
    }

    setSdkApiCallStart() {
        if (this.sdkApiCallStartTime === 0 && this.fetchCredentialStartTime !== 0) {
            this.sdkApiCallStartTime = performance.now()
        }
    }

    setSuggestionState(index: number, value: CodewhispererSuggestionState | 'Showed') {
        this.recommendations[index].suggestionState = value
    }

    getSuggestionState(index: number): string | undefined {
        return this.recommendations[index].suggestionState
    }

    getCompletionType(index: number): CodewhispererCompletionType {
        return this.recommendations[index].completionType
    }
}

// TODO: convert this to a function call
export const session = CodeWhispererSession.instance
