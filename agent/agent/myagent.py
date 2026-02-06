# Copyright 2025 DataRobot, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""
DataRobot AutoML/MLOps Agent

このエージェントは DataRobot プラットフォームを操作し、
ユーザーの自然言語による指示に基づいて機械学習ワークフローを実行します。
さらに、DataRobotのDSと同等の観点でモデルレビューを実施します。
"""
from datetime import datetime
from typing import Any, Mapping, cast

from datarobot_genai.core.agents import make_system_prompt
from datarobot_genai.langgraph.agent import LangGraphAgent
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_litellm.chat_models import ChatLiteLLM
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import create_react_agent
from langgraph.types import Command
from openai.types.chat import CompletionCreateParams

from agent.config import Config
from agent.prompts import DATAROBOT_EXPERT_PROMPT

config = Config()


class MyAgent(LangGraphAgent):
    """DataRobot AutoML/MLOps Agent & DS Model Review Assistant

    DataRobot プラットフォームを操作するための ReAct エージェント。
    ユーザーの自然言語による指示を解釈し、MCPツール経由で
    DataRobot API を呼び出します。

    さらに、DataRobotのデータサイエンティストと同等の観点で
    モデルレビューを実施し、品質・信頼性・ビジネス適合性を評価します。

    DSモデルレビュー 7フェーズ:
    1. 前提条件の再確認（問題設定の妥当性）
    2. 探索的データ分析（EDA）の深掘り
    3. パーティション（データ分割）戦略の最適化
    4. 特徴量設計とリーケージの徹底排除
    5. 多値分類・特殊ケースの注意点
    6. モデルの解釈と直感との適合（信頼性の検証）
    7. 精度向上のためのDSアクション（最終調整）

    主な機能:
    - データセットのアップロードと分析
    - AutoPilot によるモデル自動構築
    - モデル評価（ROC曲線、Feature Impact）
    - モデルのデプロイと予測実行
    - DSモデルレビュー（リーケージ検知、ビジネス直感チェック等）

    Attributes:
        workflow: ReAct パターンを実装した StateGraph
        agent: create_react_agent で構築されたエージェント
    """

    # トークン数制限（Gemini 3.0 Pro は 1M+ トークン対応、余裕を持たせて500,000に設定）
    MAX_CONTEXT_TOKENS = 500000
    # 1文字あたりの平均トークン数（日本語は約1.5-2トークン/文字）
    CHARS_PER_TOKEN = 0.5

    def _estimate_tokens(self, text: str) -> int:
        """テキストのトークン数を概算

        Args:
            text: 推定対象のテキスト

        Returns:
            int: 推定トークン数
        """
        return int(len(text) * self.CHARS_PER_TOKEN) + 1

    def _truncate_message_content(self, content: str, max_tokens: int = 2000) -> str:
        """メッセージの内容を切り詰める

        ツール結果など長いコンテンツを適切に切り詰めます。

        Args:
            content: 元のコンテンツ
            max_tokens: 最大トークン数

        Returns:
            str: 切り詰められたコンテンツ
        """
        estimated_tokens = self._estimate_tokens(content)
        if estimated_tokens <= max_tokens:
            return content

        # 最大文字数を計算
        max_chars = int(max_tokens / self.CHARS_PER_TOKEN)
        
        # JSON形式のデータを検出して切り詰め
        if content.strip().startswith("{") or content.strip().startswith("["):
            truncated = content[:max_chars]
            return truncated + "\n... [データが長すぎるため省略されました]"
        
        # 通常のテキストの場合、最後を切り詰め
        return content[:max_chars] + "\n... [続きは省略されました]"

    def convert_input_message(
        self, completion_create_params: CompletionCreateParams | Mapping[str, Any]
    ) -> Command:
        """会話履歴を MessagesState に変換（トークン制限付き）

        会話履歴を保持しつつ、トークン数制限を考慮して
        古いメッセージや長いツール結果を切り詰めます。

        Args:
            completion_create_params: OpenAI 形式のリクエストパラメータ

        Returns:
            Command: 会話履歴を含む LangGraph コマンド
        """
        params = cast(Mapping[str, Any], completion_create_params)
        messages_raw = params.get("messages", [])
        
        # OpenAI 形式のメッセージを LangChain 形式に変換
        langchain_messages = []
        total_tokens = 0
        
        # 最新のメッセージから逆順で処理し、トークン制限内に収める
        for msg in reversed(messages_raw):
            role = msg.get("role", "user")
            content = msg.get("content", "")
            
            # ツール結果（[tool:xxx] で始まる）は短く切り詰める
            if role == "assistant" and content.startswith("[tool:"):
                content = self._truncate_message_content(content, max_tokens=1500)
            # 長いアシスタントメッセージも切り詰める
            elif role == "assistant" and self._estimate_tokens(content) > 3000:
                content = self._truncate_message_content(content, max_tokens=3000)
            
            msg_tokens = self._estimate_tokens(content)
            
            # トークン制限を超える場合は古いメッセージを除外
            if total_tokens + msg_tokens > self.MAX_CONTEXT_TOKENS:
                if self.verbose:
                    print(f"[MyAgent] Token limit reached. Skipping older messages.")
                break
            
            total_tokens += msg_tokens
            
            if role == "system":
                langchain_messages.insert(0, SystemMessage(content=content))
            elif role == "assistant":
                langchain_messages.insert(0, AIMessage(content=content))
            else:  # user
                langchain_messages.insert(0, HumanMessage(content=content))
        
        if self.verbose:
            print(f"[MyAgent.convert_input_message] Converting {len(langchain_messages)}/{len(messages_raw)} messages (~{total_tokens} tokens)")
            for i, msg in enumerate(langchain_messages[-5:]):  # 最後の5件のみ表示
                content_preview = msg.content[:80] + "..." if len(msg.content) > 80 else msg.content
                print(f"  [{i}] {type(msg).__name__}: {content_preview}")
        
        command = Command(
            update={
                "messages": langchain_messages,
            },
        )
        return command

    @property
    def workflow(self) -> StateGraph[MessagesState]:
        """ReAct パターンのワークフローを定義

        シンプルな単一ノード構成で、create_react_agent が
        ツール選択と実行を自動的に処理します。

        Returns:
            StateGraph[MessagesState]: コンパイル可能なワークフロー
        """
        langgraph_workflow = StateGraph[
            MessagesState, None, MessagesState, MessagesState
        ](MessagesState)

        # 単一ノードの ReAct エージェント
        langgraph_workflow.add_node("agent", self.agent)
        langgraph_workflow.add_edge(START, "agent")
        langgraph_workflow.add_edge("agent", END)

        return langgraph_workflow  # type: ignore[return-value]

    @property
    def prompt_template(self) -> ChatPromptTemplate:
        """ユーザー入力のテンプレート

        プレーンテキストの入力を受け取り、処理します。
        フロントエンドからは自然言語テキストのみを受け付けます。

        Returns:
            ChatPromptTemplate: ユーザーメッセージのテンプレート
        """
        return ChatPromptTemplate.from_messages(
            [
                ("user", "{input}"),
            ]
        )

    def llm(
        self,
        preferred_model: str | None = None,
        auto_model_override: bool = True,
    ) -> ChatLiteLLM:
        """LLM インスタンスを取得

        DataRobot の認証情報と設定を使用して LLM を初期化します。
        直接 ChatOpenAI 等をインスタンス化せず、必ずこのメソッドを経由します。

        Args:
            preferred_model: 使用するモデル名。None の場合はデフォルトモデルを使用
            auto_model_override: LLM Gateway が利用できない場合に
                                 デフォルトモデルにフォールバックするか

        Returns:
            ChatLiteLLM: 設定済みの LLM インスタンス
        """
        api_base = self.litellm_api_base(config.llm_deployment_id)
        model = preferred_model

        if preferred_model is None:
            model = config.llm_default_model
        if auto_model_override and not config.use_datarobot_llm_gateway:
            model = config.llm_default_model

        if self.verbose:
            print(f"Using model: {model}")

        return ChatLiteLLM(
            model=model,
            api_base=api_base,
            api_key=self.api_key,
            timeout=self.timeout,
            streaming=True,
            max_retries=3,
        )

    @property
    def agent(self) -> Any:
        """ReAct エージェントを構築

        create_react_agent を使用して、MCP ツールを自動的に
        選択・実行できるエージェントを作成します。

        Returns:
            Any: ReAct エージェントインスタンス
        """
        current_datetime = datetime.now().strftime("%Y年%m月%d日 %H:%M:%S")

        return create_react_agent(
            self.llm(preferred_model="datarobot/vertex_ai/gemini-3-pro-preview"),
            tools=self.mcp_tools,
            prompt=make_system_prompt(
                DATAROBOT_EXPERT_PROMPT.format(current_datetime=current_datetime)
            ),
            name="DataRobot DS Model Review Assistant",
        )
