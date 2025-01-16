/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import globals from '../../shared/extensionGlobals'

import { runtimeLanguageContext } from './runtimeLanguageContext'
import { codeWhispererClient as client, RecommendationsList } from '../client/codewhisperer'
import { LicenseUtil } from './licenseUtil'
import {
    CodewhispererGettingStartedTask,
    CodewhispererLanguage,
    CodewhispererPreviousSuggestionState,
    CodewhispererUserDecision,
    CodewhispererUserTriggerDecision,
    telemetry,
} from '../../shared/telemetry/telemetry'
import { CodewhispererCompletionType, CodewhispererSuggestionState } from '../../shared/telemetry/telemetry'
import { getImportCount } from './importAdderUtil'
import { CodeWhispererSettings } from './codewhispererSettings'
import { getSelectedCustomization } from './customizationUtil'
import { AuthUtil } from './authUtil'
import { isAwsError } from '../../shared/errors'
import { getLogger } from '../../shared/logger'
import { session } from './codeWhispererSession'
import { CodeWhispererSupplementalContext } from '../models/model'
import { FeatureConfigProvider } from '../../shared/featureConfig'
import { CodeScanRemediationsEventType } from '../client/codewhispereruserclient'
import { CodeAnalysisScope as CodeAnalysisScopeClientSide } from '../models/constants'
import { Session } from '../../amazonqTest/chat/session/session'

export class TelemetryHelper {
    // Some variables for client component latency
    private _sdkApiCallEndTime = 0
    get sdkApiCallEndTime(): number {
        return this._sdkApiCallEndTime
    }
    private _allPaginationEndTime = 0
    get allPaginationEndTime(): number {
        return this._allPaginationEndTime
    }
    private _firstResponseRequestId = ''
    get firstResponseRequestId(): string {
        return this._firstResponseRequestId
    }
    // variables for user trigger decision
    // these will be cleared after a invocation session
    private sessionDecisions: CodewhispererUserTriggerDecision[] = []
    private triggerChar?: string = undefined
    private prevTriggerDecision?: CodewhispererPreviousSuggestionState
    private typeAheadLength = 0
    private timeSinceLastModification = 0
    private lastTriggerDecisionTime = 0
    private classifierResult?: number = undefined
    private classifierThreshold?: number = undefined
    // variables for tracking end to end sessions
    public traceId: string = 'notSet'

    // use this to distinguish DocumentChangeEvent from CWSPR or from other sources
    public lastSuggestionInDisplay = ''

    constructor() {}

    static #instance: TelemetryHelper

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public sendTestGenerationToolkitEvent(
        session: Session,
        isSupportedLanguage: boolean,
        isFileInWorkspace: boolean,
        result: 'Succeeded' | 'Failed' | 'Cancelled',
        requestId?: string,
        perfClientLatency?: number,
        reasonDesc?: string,
        isCodeBlockSelected?: boolean,
        artifactsUploadDuration?: number,
        buildPayloadBytes?: number,
        buildZipFileBytes?: number,
        acceptedCharactersCount?: number,
        acceptedCount?: number,
        acceptedLinesCount?: number,
        generatedCharactersCount?: number,
        generatedCount?: number,
        generatedLinesCount?: number,
        reason?: string
    ) {}

    public recordServiceInvocationTelemetry(
        requestId: string,
        sessionId: string,
        lastSuggestionIndex: number,
        result: 'Succeeded' | 'Failed',
        duration: number | undefined,
        language: CodewhispererLanguage,
        taskType: CodewhispererGettingStartedTask | undefined,
        reason: string,
        supplementalContextMetadata?: CodeWhispererSupplementalContext | undefined
    ) {}

    public recordUserDecisionTelemetryForEmptyList(
        requestIdList: string[],
        sessionId: string,
        paginationIndex: number,
        language: CodewhispererLanguage,
        supplementalContextMetadata?: CodeWhispererSupplementalContext | undefined
    ) {}

    /**
     * This function is to record the user decision on each of the suggestion in the list of CodeWhisperer recommendations.
     * @param recommendations the recommendations
     * @param acceptIndex the index of the accepted suggestion in the corresponding list of CodeWhisperer response.
     * If this function is not called on acceptance, then acceptIndex == -1
     * @param languageId the language ID of the current document in current active editor
     * @param paginationIndex the index of pagination calls
     * @param recommendationSuggestionState the key-value mapping from index to suggestion state
     */

    public recordUserDecisionTelemetry(
        requestIdList: string[],
        sessionId: string,
        recommendations: RecommendationsList,
        acceptIndex: number,
        paginationIndex: number,
        completionTypes: Map<number, CodewhispererCompletionType>,
        recommendationSuggestionState?: Map<number, string>,
        supplementalContextMetadata?: CodeWhispererSupplementalContext | undefined
    ) {}

    public aggregateUserDecisionByRequest(
        events: CodewhispererUserDecision[],
        requestId: string,
        sessionId: string,
        supplementalContextMetadata?: CodeWhispererSupplementalContext | undefined
    ) {}

    public sendUserTriggerDecisionTelemetry(
        sessionId: string,
        acceptedRecommendationContent: string,
        referenceCount: number,
        supplementalContextMetadata?: CodeWhispererSupplementalContext | undefined
    ) {}

    public getLastTriggerDecisionForClassifier() {}

    public setClassifierResult(classifierResult: number) {
        this.classifierResult = classifierResult
    }

    public setClassifierThreshold(classifierThreshold: number) {
        this.classifierThreshold = classifierThreshold
    }

    public setTriggerCharForUserTriggerDecision(triggerChar: string) {
        this.triggerChar = triggerChar
    }

    public setTypeAheadLength(typeAheadLength: number) {
        this.typeAheadLength = typeAheadLength
    }

    public setTimeSinceLastModification(timeSinceLastModification: number) {
        this.timeSinceLastModification = timeSinceLastModification
    }

    public setTraceId(traceId: string) {
        this.traceId = traceId
    }

    private resetUserTriggerDecisionTelemetry() {
        this.sessionDecisions = []
        this.triggerChar = ''
        this.typeAheadLength = 0
        this.timeSinceLastModification = 0
        session.timeToFirstRecommendation = 0
        session.perceivedLatency = 0
        this.classifierResult = undefined
        this.classifierThreshold = undefined
    }

    private getSendTelemetryCompletionType(completionType: CodewhispererCompletionType) {
        return completionType === 'Block' ? 'BLOCK' : 'LINE'
    }

    private getAggregatedSuggestionState(
        // if there is any Accept within the session, mark the session as Accept
        // if there is any Reject within the session, mark the session as Reject
        // if all recommendations within the session are empty, mark the session as Empty
        // otherwise mark the session as Discard
        events: CodewhispererUserDecision[] | CodewhispererUserTriggerDecision[]
    ): CodewhispererPreviousSuggestionState {
        let isEmpty = true
        for (const event of events) {
            if (event.codewhispererSuggestionState === 'Accept') {
                return 'Accept'
            } else if (event.codewhispererSuggestionState === 'Reject') {
                return 'Reject'
            } else if (event.codewhispererSuggestionState !== 'Empty') {
                isEmpty = false
            }
        }
        return isEmpty ? 'Empty' : 'Discard'
    }

    private getSendTelemetrySuggestionState(state: CodewhispererPreviousSuggestionState) {
        if (state === 'Accept') {
            return 'ACCEPT'
        } else if (state === 'Reject') {
            return 'REJECT'
        } else if (state === 'Discard') {
            return 'DISCARD'
        }
        return 'EMPTY'
    }

    private getAggregatedSuggestionReferenceCount(
        events: CodewhispererUserDecision[]
        // if there is reference for accepted recommendation within the session, mark the reference number
        // as 1, otherwise mark the session as 0
    ) {
        for (const event of events) {
            if (event.codewhispererSuggestionState === 'Accept' && event.codewhispererSuggestionReferenceCount !== 0) {
                return 1
            }
        }
        return 0
    }

    public getSuggestionState(
        i: number,
        acceptIndex: number,
        recommendationSuggestionState?: Map<number, string>
    ): CodewhispererSuggestionState {
        const state = recommendationSuggestionState?.get(i)
        if (state && ['Empty', 'Filter', 'Discard'].includes(state)) {
            return state as CodewhispererSuggestionState
        } else if (recommendationSuggestionState !== undefined && recommendationSuggestionState.get(i) !== 'Showed') {
            return 'Unseen'
        }
        if (acceptIndex === -1) {
            return 'Reject'
        }
        return i === acceptIndex ? 'Accept' : 'Ignore'
    }

    public getCompletionType(i: number, completionTypes: Map<number, CodewhispererCompletionType>) {
        return completionTypes.get(i) || 'Line'
    }

    public isTelemetryEnabled(): boolean {
        return globals.telemetry.telemetryEnabled
    }

    public resetClientComponentLatencyTime() {
        session.invokeSuggestionStartTime = 0
        session.preprocessEndTime = 0
        session.sdkApiCallStartTime = 0
        this._sdkApiCallEndTime = 0
        session.fetchCredentialStartTime = 0
        session.firstSuggestionShowTime = 0
        this._allPaginationEndTime = 0
        this._firstResponseRequestId = ''
    }

    public setPreprocessEndTime() {
        if (session.preprocessEndTime !== 0) {
            getLogger().warn(`inline completion preprocessEndTime has been set and not reset correctly`)
        }
        session.preprocessEndTime = performance.now()
    }

    /** This method is assumed to be invoked first at the start of execution **/
    public setInvokeSuggestionStartTime() {
        this.resetClientComponentLatencyTime()
        session.invokeSuggestionStartTime = performance.now()
    }

    public setSdkApiCallEndTime() {
        if (this._sdkApiCallEndTime === 0 && session.sdkApiCallStartTime !== 0) {
            this._sdkApiCallEndTime = performance.now()
        }
    }

    public setAllPaginationEndTime() {
        if (this._allPaginationEndTime === 0 && this._sdkApiCallEndTime !== 0) {
            this._allPaginationEndTime = performance.now()
        }
    }

    public setFirstSuggestionShowTime() {
        if (session.firstSuggestionShowTime === 0 && this._sdkApiCallEndTime !== 0) {
            session.firstSuggestionShowTime = performance.now()
        }
    }

    public setFirstResponseRequestId(requestId: string) {
        if (this._firstResponseRequestId === '') {
            this._firstResponseRequestId = requestId
        }
    }

    // report client component latency after all pagination call finish
    // and at least one suggestion is shown to the user
    public tryRecordClientComponentLatency() {}
    public sendCodeScanEvent(languageId: string, jobId: string) {
        getLogger().debug(`start sendCodeScanEvent: jobId: "${jobId}", languageId: "${languageId}"`)

        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    codeScanEvent: {
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(languageId as CodewhispererLanguage),
                        },
                        codeScanJobId: jobId,
                        timestamp: new Date(Date.now()),
                    },
                },
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }

                getLogger().debug(
                    `Failed to sendCodeScanEvent to CodeWhisperer, requestId: ${requestId ?? ''}, message: ${
                        error.message
                    }`
                )
            })
    }

    public sendCodeScanSucceededEvent(
        language: string,
        jobId: string,
        numberOfFindings: number,
        scope: CodeAnalysisScopeClientSide
    ) {
        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    codeScanSucceededEvent: {
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(language as CodewhispererLanguage),
                        },
                        codeScanJobId: jobId,
                        numberOfFindings: numberOfFindings,
                        timestamp: new Date(Date.now()),
                        codeAnalysisScope: scope === CodeAnalysisScopeClientSide.FILE_AUTO ? 'FILE' : 'PROJECT',
                    },
                },
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }

                getLogger().debug(
                    `Failed to sendTelemetryEvent for code scan success, requestId: ${requestId ?? ''}, message: ${
                        error.message
                    }`
                )
            })
    }

    public sendCodeScanFailedEvent(language: string, jobId: string, scope: CodeAnalysisScopeClientSide) {
        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    codeScanFailedEvent: {
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(language as CodewhispererLanguage),
                        },
                        codeScanJobId: jobId,
                        codeAnalysisScope: scope === CodeAnalysisScopeClientSide.FILE_AUTO ? 'FILE' : 'PROJECT',
                        timestamp: new Date(Date.now()),
                    },
                },
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }
                getLogger().debug(
                    `Failed to sendTelemetryEvent for code scan failure, requestId: ${requestId ?? ''}, message: ${
                        error.message
                    }`
                )
            })
    }

    public sendCodeFixGenerationEvent(
        jobId: string,
        language?: string,
        ruleId?: string,
        detectorId?: string,
        linesOfCodeGenerated?: number,
        charsOfCodeGenerated?: number
    ) {
        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    codeFixGenerationEvent: {
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(language as CodewhispererLanguage),
                        },
                        jobId,
                        ruleId,
                        detectorId,
                        linesOfCodeGenerated,
                        charsOfCodeGenerated,
                    },
                },
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }
                getLogger().debug(
                    `Failed to sendTelemetryEvent for code fix generation, requestId: ${requestId ?? ''}, message: ${
                        error.message
                    }`
                )
            })
    }

    public sendCodeFixAcceptanceEvent(
        jobId: string,
        language?: string,
        ruleId?: string,
        detectorId?: string,
        linesOfCodeAccepted?: number,
        charsOfCodeAccepted?: number
    ) {
        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    codeFixAcceptanceEvent: {
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(language as CodewhispererLanguage),
                        },
                        jobId,
                        ruleId,
                        detectorId,
                        linesOfCodeAccepted,
                        charsOfCodeAccepted,
                    },
                },
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }
                getLogger().debug(
                    `Failed to sendTelemetryEvent for code fix acceptance, requestId: ${requestId ?? ''}, message: ${
                        error.message
                    }`
                )
            })
    }

    public sendTestGenerationEvent(
        groupName: string,
        jobId: string,
        language?: string,
        numberOfUnitTestCasesGenerated?: number,
        numberOfUnitTestCasesAccepted?: number,
        linesOfCodeGenerated?: number,
        linesOfCodeAccepted?: number,
        charsOfCodeGenerated?: number,
        charsOfCodeAccepted?: number
    ) {
        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    testGenerationEvent: {
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(language as CodewhispererLanguage),
                        },
                        jobId,
                        groupName,
                        ideCategory: 'VSCODE',
                        numberOfUnitTestCasesGenerated,
                        numberOfUnitTestCasesAccepted,
                        linesOfCodeGenerated,
                        linesOfCodeAccepted,
                        charsOfCodeGenerated,
                        charsOfCodeAccepted,
                        timestamp: new Date(Date.now()),
                    },
                },
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }
                getLogger().debug(
                    `Failed to sendTelemetryEvent for test generation, requestId: ${requestId ?? ''}, message: ${
                        error.message
                    }`
                )
            })
    }

    public sendCodeScanRemediationsEvent(
        languageId?: string,
        codeScanRemediationEventType?: CodeScanRemediationsEventType,
        detectorId?: string,
        findingId?: string,
        ruleId?: string,
        component?: string,
        reason?: string,
        result?: string,
        includesFix?: boolean
    ) {
        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    codeScanRemediationsEvent: {
                        programmingLanguage: languageId
                            ? {
                                  languageName: runtimeLanguageContext.toRuntimeLanguage(
                                      languageId as CodewhispererLanguage
                                  ),
                              }
                            : undefined,
                        CodeScanRemediationsEventType: codeScanRemediationEventType,
                        detectorId: detectorId,
                        findingId: findingId,
                        ruleId: ruleId,
                        component: component,
                        reason: reason,
                        result: result,
                        includesFix: includesFix,
                        timestamp: new Date(Date.now()),
                    },
                },
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }
                getLogger().debug(
                    `Failed to sendCodeScanRemediationsEvent to CodeWhisperer, requestId: ${
                        requestId ?? ''
                    }, message: ${error.message}`
                )
            })
    }
}
