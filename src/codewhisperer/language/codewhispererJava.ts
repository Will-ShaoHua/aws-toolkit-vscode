/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodewhispererLanguage } from '../../shared/telemetry/telemetry.gen'
import { CodeWhispererProgrammingLanguage } from './codewhispererProgrammingLanguage'

export class CodeWhispererJava extends CodeWhispererProgrammingLanguage {
    id: CodewhispererLanguage = 'java'

    toCodeWhispererRuntimeLanguage(): CodeWhispererProgrammingLanguage {
        return this
    }

    isCodeCompletionSupported(): boolean {
        return true
    }

    isCodeScanSupported(): boolean {
        return true
    }
}
