"""
Error message utilities for AITuberFlow nodes.

Provides standardized error messages with actionable guidance in multiple languages.
"""

from enum import Enum
from typing import Optional


class ErrorCode(Enum):
    """Standardized error codes for AITuberFlow nodes."""

    # TTS errors
    TTS_CONNECTION_FAILED = "TTS_CONNECTION_FAILED"
    TTS_SPEAKER_NOT_CONFIGURED = "TTS_SPEAKER_NOT_CONFIGURED"
    TTS_SYNTHESIS_FAILED = "TTS_SYNTHESIS_FAILED"

    # LLM errors
    LLM_API_KEY_MISSING = "LLM_API_KEY_MISSING"
    LLM_CONNECTION_FAILED = "LLM_CONNECTION_FAILED"
    LLM_RATE_LIMIT = "LLM_RATE_LIMIT"
    LLM_API_ERROR = "LLM_API_ERROR"

    # General errors
    PACKAGE_NOT_INSTALLED = "PACKAGE_NOT_INSTALLED"
    INVALID_INPUT = "INVALID_INPUT"
    CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT"


ERROR_MESSAGES: dict[ErrorCode, dict[str, str]] = {
    ErrorCode.TTS_CONNECTION_FAILED: {
        "ja": """{service}に接続できません ({host})
[対処法]
1. {service}が起動しているか確認してください
2. ホストアドレスが正しいか確認してください
3. ファイアウォールがブロックしていないか確認してください""",
        "en": """Cannot connect to {service} at {host}
[Action Required]
1. Ensure {service} is running
2. Check the host address is correct
3. Verify firewall is not blocking the connection""",
    },
    ErrorCode.TTS_SPEAKER_NOT_CONFIGURED: {
        "ja": """{service}のスピーカーが設定されていません
[対処法] ノード設定でスピーカーIDまたはUUIDを入力してください""",
        "en": """{service} speaker not configured
[Action Required] Enter the speaker ID or UUID in node settings""",
    },
    ErrorCode.TTS_SYNTHESIS_FAILED: {
        "ja": """音声合成に失敗しました: {error}
[対処法]
1. テキストが長すぎないか確認してください
2. {service}のログを確認してください""",
        "en": """Speech synthesis failed: {error}
[Action Required]
1. Check if the text is too long
2. Review {service} logs for details""",
    },
    ErrorCode.LLM_API_KEY_MISSING: {
        "ja": """{provider} APIキーが設定されていません
[対処法] ノード設定の「APIキー」に入力してください""",
        "en": """{provider} API key not configured
[Action Required] Enter it in the "API Key" field in node settings""",
    },
    ErrorCode.LLM_CONNECTION_FAILED: {
        "ja": """{provider} APIに接続できません
[対処法]
1. インターネット接続を確認してください
2. APIキーが有効か確認してください
3. APIのステータスページを確認してください""",
        "en": """Cannot connect to {provider} API
[Action Required]
1. Check your internet connection
2. Verify the API key is valid
3. Check the API status page""",
    },
    ErrorCode.LLM_RATE_LIMIT: {
        "ja": """{provider} APIのレート制限に達しました
[対処法]
1. しばらく待ってから再試行してください
2. APIプランのアップグレードを検討してください""",
        "en": """{provider} API rate limit exceeded
[Action Required]
1. Wait a moment and try again
2. Consider upgrading your API plan""",
    },
    ErrorCode.LLM_API_ERROR: {
        "ja": """{provider} APIエラー: {error}
[対処法] APIの設定とリクエスト内容を確認してください""",
        "en": """{provider} API error: {error}
[Action Required] Check your API settings and request content""",
    },
    ErrorCode.PACKAGE_NOT_INSTALLED: {
        "ja": """{package}パッケージがインストールされていません
[対処法] 次のコマンドを実行してください: pip install {package}""",
        "en": """{package} package is not installed
[Action Required] Run: pip install {package}""",
    },
    ErrorCode.INVALID_INPUT: {
        "ja": """入力が無効です: {field}
[対処法] 正しい値を入力してください""",
        "en": """Invalid input: {field}
[Action Required] Please provide a valid value""",
    },
    ErrorCode.CONNECTION_TIMEOUT: {
        "ja": """{service}への接続がタイムアウトしました ({host})
[対処法]
1. {service}が起動しているか確認してください
2. ネットワーク接続を確認してください""",
        "en": """Connection to {service} timed out ({host})
[Action Required]
1. Ensure {service} is running
2. Check your network connection""",
    },
}


def get_error_message(
    code: ErrorCode,
    lang: str = "ja",
    **kwargs: str,
) -> str:
    """
    Get a localized error message with formatting.

    Args:
        code: The error code
        lang: Language code ("ja" or "en")
        **kwargs: Format arguments for the message template

    Returns:
        Formatted error message string
    """
    messages = ERROR_MESSAGES.get(code, {})
    template = messages.get(lang) or messages.get("en") or str(code.value)
    try:
        return template.format(**kwargs).strip()
    except KeyError:
        # Return template as-is if formatting fails
        return template.strip()


def format_error_with_action(
    title: str,
    actions: list[str],
    lang: str = "ja",
) -> str:
    """
    Create a custom error message with action items.

    Args:
        title: Error title/description
        actions: List of action items
        lang: Language code ("ja" or "en")

    Returns:
        Formatted error message with action list
    """
    header = "[対処法]" if lang == "ja" else "[Action Required]"
    action_list = "\n".join(f"{i+1}. {action}" for i, action in enumerate(actions))
    return f"{title}\n{header}\n{action_list}"
