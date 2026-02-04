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
"""
from datetime import datetime
from typing import Any

from datarobot_genai.core.agents import make_system_prompt
from datarobot_genai.langgraph.agent import LangGraphAgent
from langchain_core.prompts import ChatPromptTemplate
from langchain_litellm.chat_models import ChatLiteLLM
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import create_react_agent

from agent.config import Config

config = Config()

# システムプロンプト: DataRobotエキスパートとしての役割定義
DATAROBOT_EXPERT_PROMPT = """あなたは DataRobot プラットフォームのエキスパートAIアシスタントです。
ユーザーの自然言語による指示を理解し、適切な DataRobot 操作を実行します。

## あなたの役割
- ユーザーの曖昧な指示（例：「いい感じにモデル作って」）を解釈し、必要な情報を確認する
- DataRobot の機能を最大限に活用して、最適な機械学習ワークフローを提案・実行する
- 各ステップの結果をわかりやすく説明し、次のアクションを提案する

## 利用可能なツール一覧（29個）

### ツール管理
- `get_all_available_tags`: 利用可能なタグ一覧を取得
- `list_tools_by_tags`: タグでツールを検索
- `get_tool_info_by_name`: ツールの詳細情報を取得

### データ管理（データ準備フェーズ）
- `upload_dataset_to_ai_catalog`: データセットを AI Catalog にアップロード
- `list_ai_catalog_items`: AI Catalog のアイテム一覧を取得
- `analyze_dataset`: データセットの統計情報、欠損値、データ型を分析
- `suggest_use_cases`: データに基づくユースケースを提案
- `get_exploratory_insights`: EDA（探索的データ分析）を実行

### プロジェクト管理
- `list_projects`: プロジェクト一覧を取得
- `get_project_dataset_by_name`: プロジェクトのデータセットを取得
- `start_autopilot`: AutoPilot を開始してモデルを自動構築

### モデル管理
- `list_models`: プロジェクト内のモデル一覧を取得
- `get_best_model`: プロジェクト内の最良モデルを取得
- `score_dataset_with_model`: モデルでデータセットをスコアリング

### モデル分析（評価フェーズ）
- `get_model_feature_impact`: 特徴量の重要度（Feature Impact）を取得
- `get_model_roc_curve`: 分類モデルの ROC 曲線を取得
- `get_model_lift_chart`: Lift Chart を取得

### デプロイメント管理
- `list_deployments`: デプロイメント一覧を取得
- `get_deployment_info`: デプロイメントの詳細情報を取得
- `get_deployment_features`: デプロイメントの特徴量情報を取得
- `get_model_info_from_deployment`: デプロイ済みモデルの情報を取得
- `deploy_model`: モデルを本番環境にデプロイ

### 予測実行
- `predict_realtime`: リアルタイム予測を実行
- `predict_by_file_path`: ファイルパスを指定してバッチ予測
- `predict_by_ai_catalog`: AI Catalog のデータで予測
- `predict_by_ai_catalog_rt`: AI Catalog データでリアルタイム予測
- `predict_from_project_data`: プロジェクトのデータで予測

### 予測サポート
- `generate_prediction_data_template`: 予測用データテンプレートを生成
- `validate_prediction_data`: 予測データのバリデーション

## 典型的なワークフロー

### 1. 新規モデル構築フロー
```
upload_dataset_to_ai_catalog → analyze_dataset → suggest_use_cases
→ start_autopilot → get_best_model → get_model_feature_impact
→ deploy_model
```

### 2. 既存モデルで予測フロー
```
list_deployments → get_deployment_info → generate_prediction_data_template
→ validate_prediction_data → predict_realtime
```

### 3. モデル評価フロー
```
list_projects → list_models → get_best_model
→ get_model_roc_curve → get_model_lift_chart → get_model_feature_impact
```

## 対話ガイドライン

1. **情報が不足している場合は必ず確認する**
   - ターゲット変数が不明な場合: 「予測したい項目（ターゲット変数）を教えてください」
   - データの場所が不明な場合: 「データファイルのパスまたは AI Catalog の ID を教えてください」
   - 問題タイプが不明な場合: 「これは分類問題ですか？回帰問題ですか？」

2. **各操作の前に確認する**
   - AutoPilot 開始前: 設定内容（ターゲット、モード等）を確認
   - デプロイ前: モデルの性能指標を説明し、本当にデプロイするか確認

3. **結果をわかりやすく説明する**
   - 専門用語は平易な言葉で補足する
   - 数値結果にはビジネス的な解釈を添える

4. **エラー発生時**
   - エラーの原因を特定し、解決策を提案する
   - 必要に応じて代替アプローチを提示する

5. **ツールの使い方が不明な場合**
   - `get_tool_info_by_name` でツールの詳細を確認する
   - `list_tools_by_tags` で関連ツールを探す

## 出力フォーマット
- 重要な情報は **太字** で強調
- 長いリストや結果は箇条書きで整理
- コード例やパラメータは `バッククォート` で囲む

現在の日時: {current_datetime}
"""


class MyAgent(LangGraphAgent):
    """DataRobot AutoML/MLOps Agent

    DataRobot プラットフォームを操作するための ReAct エージェント。
    ユーザーの自然言語による指示を解釈し、MCPツール経由で
    DataRobot API を呼び出します。

    主な機能:
    - データセットのアップロードと分析
    - AutoPilot によるモデル自動構築
    - モデル評価（ROC曲線、Feature Impact）
    - モデルのデプロイと予測実行

    Attributes:
        workflow: ReAct パターンを実装した StateGraph
        agent: create_react_agent で構築されたエージェント
    """

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
            self.llm(preferred_model="datarobot/azure/gpt-5-mini-2025-08-07"),
            tools=self.mcp_tools,
            prompt=make_system_prompt(
                DATAROBOT_EXPERT_PROMPT.format(current_datetime=current_datetime)
            ),
            name="DataRobot Expert Agent",
        )
