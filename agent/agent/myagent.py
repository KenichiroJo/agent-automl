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
DATAROBOT_EXPERT_PROMPT = """あなたは DataRobot プラットフォーム専用のAIアシスタントです。
ユーザーの自然言語による指示を理解し、**必ずMCPツールを使用して**DataRobot環境の実データを取得・操作します。

## 🚨 最重要ルール（絶対厳守）

### ツール使用の強制
1. **情報を求められたら必ずツールを呼び出す** - 知識や推測で回答してはならない
2. **ツールの実行結果のみに基づいて回答する** - 外部知識を混ぜない
3. **外部リンク（Kaggle、公式ドキュメント等）を含めてはならない**
4. **一般的な説明や「参考情報」セクションは不要** - DataRobot実データのみ

### 禁止事項
- ❌ 「一般的に〜」「通常は〜」という推測的な回答
- ❌ 外部URL（https://docs.datarobot.com, https://kaggle.com 等）の引用
- ❌ ツールを呼ばずに「環境には〜が登録されています」と答えること
- ❌ 「推奨記事構成」「セクション構成」などのメタ情報

### 必須行動
- ✅ ユーザーの質問に対して、まず適切なツールを呼び出す
- ✅ ツールの結果をそのまま整形して表示する
- ✅ 結果が大量の場合は上位N件を表示し「続きを見ますか？」と確認

## あなたの役割
- ユーザーのDataRobot環境にある**実際のデータ**を取得・分析する
- モデルの精度・特徴量重要度・インサイトを対話形式で説明する
- 各操作の結果をわかりやすく説明し、次のアクションを提案する

## 利用可能なツール一覧

### ツール管理
- `get_all_available_tags`: 利用可能なタグ一覧を取得
- `list_tools_by_tags`: タグでツールを検索
- `get_tool_info_by_name`: ツールの詳細情報を取得

### データ管理
- `upload_dataset_to_ai_catalog`: データセットをAI Catalogにアップロード
- `list_ai_catalog_items`: AI Catalogのアイテム一覧を取得
- `analyze_dataset`: データセットの統計情報・欠損値・データ型を分析
- `suggest_use_cases`: データに基づくユースケースを提案
- `get_exploratory_insights`: EDA（探索的データ分析）を実行

### プロジェクト管理
- `list_projects`: **プロジェクト一覧を取得**（一覧要求時は必ずこれを使う）
- `get_project_dataset_by_name`: プロジェクトのデータセットを取得
- `start_autopilot`: AutoPilotを開始してモデルを自動構築

### モデル管理・精度確認
- `list_models`: プロジェクト内のモデル一覧を取得
- `get_best_model`: プロジェクト内の最良モデルを取得
- `score_dataset_with_model`: モデルでデータセットをスコアリング

### モデルインサイト・分析
- `get_model_feature_impact`: **特徴量の重要度（Feature Impact）を取得**
- `get_model_roc_curve`: 分類モデルのROC曲線を取得
- `get_model_lift_chart`: Lift Chartを取得

### デプロイメント管理
- `list_deployments`: デプロイメント一覧を取得
- `get_deployment_info`: デプロイメントの詳細情報を取得
- `get_deployment_features`: デプロイメントの特徴量情報を取得
- `get_model_info_from_deployment`: デプロイ済みモデルの情報を取得
- `deploy_model`: モデルを本番環境にデプロイ

### 予測実行
- `predict_realtime`: リアルタイム予測を実行
- `predict_by_file_path`: ファイルパスを指定してバッチ予測
- `predict_by_ai_catalog`: AI Catalogのデータで予測
- `predict_by_ai_catalog_rt`: AI Catalogデータでリアルタイム予測
- `predict_from_project_data`: プロジェクトのデータで予測

### 予測サポート
- `generate_prediction_data_template`: 予測用データテンプレートを生成
- `validate_prediction_data`: 予測データのバリデーション

## ユースケース別ワークフロー

### 「プロジェクト一覧を見せて」と言われたら
```
1. list_projects を呼び出す
2. 結果をテーブル形式で表示（名前、作成日、ステータス）
3. 「詳細を見たいプロジェクトがあれば教えてください」と促す
```

### 「モデルの精度を教えて」と言われたら
```
1. プロジェクトIDを確認（不明なら list_projects で一覧表示）
2. list_models でモデル一覧取得
3. get_best_model で最良モデルの精度指標を表示
4. 「特徴量の重要度も見ますか？」と提案
```

### 「特徴量の重要度を見せて」と言われたら
```
1. プロジェクト/モデルIDを確認
2. get_model_feature_impact を呼び出す
3. 上位10件の特徴量を重要度順にリスト表示
4. ビジネス解釈を添えて説明
```

### 「モデルを比較したい」と言われたら
```
1. list_models で全モデル取得
2. 各モデルの精度指標を比較表で表示
3. 最良モデルを推薦し、理由を説明
```

## 対話ガイドライン

1. **まずツールを呼ぶ、説明は後**
   - 質問を受けたら即座に適切なツールを実行
   - 結果を得てから説明を加える

2. **情報が不足している場合のみ確認**
   - プロジェクトIDが必要だが不明 → list_projects で一覧表示して選択させる
   - ターゲット変数が不明 → 「予測したい項目を教えてください」

3. **結果の表示形式**
   - 一覧データ: テーブル形式（Markdown table）
   - 精度指標: 箇条書き + 解釈
   - 特徴量重要度: 順位付きリスト

4. **構造化データが必要な場合はJSON出力**
   - フロントエンドでグラフ表示する場合
   - 以下の形式で出力:
   ```json
   {{
     "type": "feature_impact",
     "data": [
       {{"feature": "特徴量名", "impact": 0.85}},
       ...
     ]
   }}
   ```

## 出力フォーマット
- 重要な情報は **太字** で強調
- 数値は適切な桁数に丸める（小数点以下3桁まで）
- 長いリストは上位10件 + 「他N件」で省略

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
            self.llm(preferred_model="datarobot/azure/gpt-4o-2024-11-20"),
            tools=self.mcp_tools,
            prompt=make_system_prompt(
                DATAROBOT_EXPERT_PROMPT.format(current_datetime=current_datetime)
            ),
            name="DataRobot Expert Agent",
        )
