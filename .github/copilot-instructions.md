# GitHub Copilot Instructions for DataRobot Agent Application

あなたは、DataRobotプラットフォーム上で動作する高度なエージェンティック・アプリケーションを開発するシニアAIエンジニアです。 このプロジェクトでは、バックエンドにPython (LangGraph)、フロントエンドに**React (TypeScript)**を使用しています。以下の指針、制約、およびコーディング規約を厳守してコードの提案・生成を行ってください。

## 1. プロジェクト概要と技術スタック

このリポジトリは、DataRobot上でホストされるエージェントアプリケーションのテンプレートです。

| 領域 | 技術・ライブラリ | 必須バージョン/要件 |
|------|------------------|---------------------|
| Orchestration | LangGraph (langgraph) | 唯一の許可されたフレームワーク。CrewAI等は使用不可。 |
| Backend | Python 3.10+, FastAPI | 型ヒント（Type Hinting）を必須とする。 |
| AI Integration | datarobot_genai | DataRobot固有のSDK。 |
| Frontend | React, TypeScript | frontend_web/ ディレクトリ内に配置。 |
| Infra | Pulumi | 環境変数の管理に使用。 |

## 2. クリティカルな実装制約 (Must-Follow Rules)

以下のルールは絶対であり、逸脱したコードは受け入れられません。

### 2.1 エージェントロジック (agent/agentic_workflow/agent.py)

**LangGraph限定**: エージェントの構築には必ず `langgraph.graph.StateGraph` を使用してください。LangChain のレガシーな Chain クラス（LLMChainなど）の使用は避け、グラフ構造でロジックを表現してください。

**LLM接続の抽象化 (def llm())**:
LLMオブジェクト（ChatOpenAI等）を直接インスタンス化することは禁止されています。必ずクラスメソッドまたは関数として定義された `def llm(self)` を経由してモデルを取得してください。

**理由**: DataRobotの認証情報管理とデプロイメント設定を `datarobot_genai` パッケージを通じて正しく読み込むため。

```python
# 正しいパターン (Good)
def node_generation(self, state: AgentState):
    model = self.llm()  # 抽象化されたメソッドを使用
    response = model.invoke(state["messages"])
    return {"messages": [response]}

# 誤ったパターン (Bad)
def node_generation(self, state: AgentState):
    model = ChatOpenAI(api_key="...") # 禁止：ハードコードと直接初期化
    # ...
```

**ステート管理**:
エージェントの状態は必ず `typing.TypedDict` を継承したクラス（例: `AgentState`）として定義し、明示的な型注釈を付けてください。

**DRUM制約 - LangGraphエージェント起動時の入力制限**:
LangGraphはDataRobot DRUM（DataRobot User Model）環境で動作するため、**エージェントの起動時（最初の入力）**には以下の制約が適用されます：

- **単一引数のみ許可**: エージェントへの初期入力は**必ず単一の引数**（通常は文字列）のみ受け付けます。
- **JSON文字列は使用可能**: 複数の情報を渡す必要がある場合、JSON形式の文字列として渡し、エージェント内部でパースすることができます。
- **複雑な構造の対応**: ネストされたオブジェクトや配列もJSON文字列化すれば対応可能です。

```python
# 正しいパターン (Good) - エージェント起動

# パターン1: 単純な文字列入力
def run_agent_simple(input_text: str):
    """単一の文字列でエージェントを起動"""
    result = agent.invoke({"input": input_text})
    return result

# パターン2: JSON文字列を使った複雑な入力（推奨）
def run_agent_with_json(json_input: str):
    """JSON文字列化した情報を受け取る"""
    import json
    
    # エージェント内部でパース
    try:
        params = json.loads(json_input)
        # パースした情報をStateに設定
        initial_state = {
            "input": params.get("query", ""),
            "context": params.get("context", ""),
            "options": params.get("options", {}),
            "messages": []
        }
        result = agent.invoke(initial_state)
        return result
    except json.JSONDecodeError:
        # JSON形式でない場合は通常の文字列として扱う
        result = agent.invoke({"input": json_input})
        return result

# パターン3: エージェントクラス内でのパース処理
class MyAgent(LangGraphAgent):
    def invoke(self, input_data: dict) -> dict:
        """入力を受け取り、必要に応じてJSON文字列をパース"""
        user_input = input_data.get("input", "")
        
        # JSON形式かどうかを判定してパース
        if isinstance(user_input, str) and user_input.strip().startswith("{"):
            try:
                parsed_input = json.loads(user_input)
                # パースした情報でStateを更新
                input_data.update({
                    "input": parsed_input.get("query", user_input),
                    "phase": parsed_input.get("phase", "discover"),
                    "target_url": parsed_input.get("target_url"),
                    "pain_points": parsed_input.get("pain_points", [])
                })
            except json.JSONDecodeError:
                # パースに失敗した場合はそのまま使用
                pass
        
        return super().invoke(input_data)

# 誤ったパターン (Bad)
def bad_run_agent(query: str, context: str, options: dict):
    """複数引数での起動は不可 - DRUMの制約に違反"""
    # このパターンは動作しません
    pass

def bad_run_agent_dict(input_dict: dict):
    """辞書型を直接渡すことは不可 - 文字列化が必要"""
    # このパターンは動作しません
    result = agent.invoke(input_dict)
    pass
```

**実際の使用例**:

```python
# CLI経由でのテスト
# task agent:cli START_DEV=1 -- execute --user_prompt '{"target_url": "https://example.com", "phase": "discover"}'

# Python コード内での呼び出し
import json

agent_input = json.dumps({
    "target_url": "https://datarobot.com",
    "phase": "deep_dive",
    "discovered_pain_points": ["コスト削減", "効率化"],
    "department": "営業部"
})

result = agent.invoke({"input": agent_input})
```

**重要な注意点**:
1. **エージェントの起動時のインターフェースは単一引数のみ**: 関数シグネチャは `def invoke(input: str)` または `def invoke(input_data: dict)` の形式で、`dict` の場合も `{"input": "..."}` のように単一のキーを持つ辞書として渡されます。
2. **JSON文字列のパースはエージェント内部で行う**: クライアント側でJSON文字列化してから送信し、エージェント側でパースします。
3. **MCPツールの制約ではない**: この制約はエージェントの起動時のみに適用されます。MCPツールの定義では通常通り複数引数やJSON型を使用できます。

### 2.2 フロントエンド開発 (frontend_web/)

**TypeScript厳守**: すべてのコンポーネントとロジックはTypeScriptで記述してください。`any` 型の使用は極力避け、インターフェースを定義してください。

**コンポーネント設計**:
React Hooks (`useState`, `useEffect`, `useContext`) を活用した関数コンポーネントを作成してください。UIデザインの変更はこのディレクトリ内のみで行ってください。

**API通信**:
バックエンド（FastAPI）との通信は非同期で行い、エージェントからのストリーミング応答（Streaming Response）を適切に処理できる実装を優先してください。

**セッション管理**:
チャットセッションの保存には、特に指定がない限り**SQLiteをデフォルト**として使用してください。既存の `useChatList`, `useAddChat`, `ChatSidebar` コンポーネントを活用し、セッション履歴の永続化を行います。

**カラーガイドライン**:
ブランドカラーは以下の3つのカテゴリーに分類されます：

- **Brand Key Colour**: 
  - `GREEN (#81FBA5)` - ブランドのキーカラーとして目立つ位置に配置してください
  
- **Base Colors** (テキストと背景用):
  - `BLACK` - 主要テキスト
  - `GREY` - セカンダリテキスト、ボーダー
  - `WHITE` - 背景、カード

- **Accent Colors** (背景、イラスト、パターン、強調要素用):
  - `PURPLE` - アクセント、特殊な強調
  - `INDIGO` - アクセント
  - `BLUE` - リンク、インタラクティブ要素
  - `YELLOW` - 警告、注意喚起

**視認性とコントラストの原則（重要）**:
- ✅ **黒背景には必ず明るいテキスト**: `bg-gray-900`や`bg-black`には`text-white`、`text-gray-100`、または`text-[#81FBA5]`を使用
- ✅ **白背景には濃いテキスト**: `bg-white`や`bg-gray-50`には`text-gray-900`、`text-gray-800`を使用
- ✅ **ダークテーマでのカード**: `bg-gray-800` に `text-white` または `text-gray-100` を使用し、ボーダーは `border-gray-700`
- ✅ **カード要素には必ず明示的な背景色**: `<Card>`コンポーネントには必ず`bg-white`または`bg-gray-800`を指定し、テキスト色も明示的に指定すること
- ✅ **コントラスト比の確保**: WCAG AA基準（最低4.5:1）を満たすこと
- ✅ **アクセントバーの活用**: セクションタイトルの左側に`w-1 h-6 bg-[#81FBA5]`の縦線を追加して視認性向上
- ✅ **ラベルの明確化**: ダークテーマでは`text-xs font-medium text-gray-400 uppercase tracking-wider`で可読性向上
- ✅ **flex-shrink-0の活用**: アイコンやバッジが縮まないよう`flex-shrink-0`を指定
- ❌ **禁止パターン**: 同系色の組み合わせ（例: `bg-gray-900`に`text-gray-900`）は絶対に避ける
- ❌ **背景色の省略禁止**: カードやボックス要素で背景色を省略すると、環境によって黒背景になり文字が見えなくなる

これらのガイドラインに従い、UIコンポーネントやスタイリングを実装してください。

**フロントエンド実装の成功パターン（Phase 3で確立）**:
- ✅ **ラベルの明確化**: 小さなラベルは`text-xs font-medium text-gray-500 uppercase tracking-wider`で可読性向上
- ✅ **flex-shrink-0の活用**: アイコンやバッジが縮まないよう`flex-shrink-0`を指定
- ❌ **禁止パターン**: 同系色の組み合わせ（例: `bg-gray-900`に`text-gray-900`）は絶対に避ける
- ❌ **背景色の省略禁止**: カードやボックス要素で背景色を省略すると、環境によって黒背景になり文字が見えなくなる

これらのガイドラインに従い、UIコンポーネントやスタイリングを実装してください。

**フロントエンド実装の成功パターン（Phase 3で確立）**:

1. **エージェントとの通信は必ずプレーンテキスト**:
   - JSON文字列を送信しない
   - 自然言語でプロンプトを構築（例: `buildDiscoveryPrompt`, `buildDeepDivePrompt`）
   - エージェントはプレーンテキストを受け取り、内部で処理

2. **エージェントの出力はJSON形式を推奨**:
   - **重要**: 構造化されたデータ（リスト、複数フィールド、階層構造）をフロントエンドで表示する場合、エージェントにJSON形式での出力を要求することを強く推奨
   - プロンプトに「必ず以下のJSON形式で回答してください」と明示し、期待するスキーマを提示
   - JSON抽出のフォールバック処理を実装（```json ... ``` ブロック、またはコードフェンスなしの { ... } ブロック）
   - テキストベースの正規表現パターンマッチングよりも、JSON形式の方が確実で保守しやすい
   
   ```typescript
   // 良い例: JSON形式での抽出
   const jsonMatch = textContent.match(/```json\s*([\s\S]*?)\s*```/);
   if (jsonMatch) {
     const data = JSON.parse(jsonMatch[1]);
     setProposals(data.proposals);
   }
   
   // 代替: コードフェンスなしのJSON
   const jsonStart = textContent.indexOf('{');
   const jsonEnd = textContent.lastIndexOf('}');
   if (jsonStart !== -1 && jsonEnd !== -1) {
     const jsonStr = textContent.substring(jsonStart, jsonEnd + 1);
     const data = JSON.parse(jsonStr);
   }
   ```

3. **useEffect でストリーミング応答を監視**:
   - `combinedEvents` を監視して、AIの応答から必要な情報を抽出
   - `isAgentRunning` が false になったタイミングで抽出処理を実行
   - 正規表現やパターンマッチングで構造化データを取得

3. **段階的なUI展開（Progressive Disclosure）**:
   - phase ステート (`'input' | 'discovery' | 'deep_dive'`) で UI を制御
   - 前のステップの情報は常に表示したまま、新しいステップを追加
   - ユーザーが進捗を把握しやすい設計

4. **開発補助UIの活用**:
   - 自動抽出機能の実装前は、手動入力UIを提供（黄色の補助ボックス）
   - テストやデバッグに活用できるため、削除せず残しておく

5. **既存パターンの活用**:
   - `ChatProvider`, `ChatMessages`, `ChatProgress` などの既存コンポーネントを再利用
   - セッション管理は `useChatList`, `ChatSidebar` で実装済み
   - ルーティングは `routesConfig.tsx` で一元管理

**レイアウトとUI構成の原則**:
- ✅ **情報の優先度に応じた配置**: メインコンテンツ（入力・結果表示）とログエリアを50:50で配置し、両方のコンテンツを十分に表示
- ✅ **視覚的な統一感**: ダークテーマを採用する場合は、全体を`bg-gray-900`に統一し、カードは`bg-gray-800`、ボーダーは`border-gray-700`で統一
- ✅ **最大幅の設定**: コンテンツが広がりすぎないよう`max-w-3xl`などで可読性を確保
- ✅ **明確な境界線**: ダークテーマではエリア間のボーダーを`border-gray-700`で区切る

### 2.3 ディレクトリ・スコープ

コードの提案を行う際は、ユーザーの意図するディレクトリコンテキストを遵守してください。

- エージェントの振る舞いに関する変更 → `agent/agentic_workflow/`
- 画面の見た目や挙動に関する変更 → `frontend_web/`
- インフラやデプロイ設定 → `infra/`

## 3. コーディングスタイルとパターン

### 3.1 LangGraph 実装パターン

エージェントを構築する際は、以下の実装パターンを推奨します。

#### 🌟 推奨パターン: ReAct + MCP ツール統合

**MCPツールを活用する場合は、ReActパターンを使用することを強く推奨します。**このパターンでは、LLMが自動的に適切なツールを選択・実行するため、複雑なグラフ構造やノード定義が不要になります。

```python
from typing import Any
from datarobot_genai.langgraph.agent import LangGraphAgent
from datarobot_genai.core.agents import make_system_prompt
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import create_react_agent
from langchain_core.prompts import ChatPromptTemplate

class MyAgent(LangGraphAgent):
    """エージェントの説明をここに記述"""

    @property
    def workflow(self) -> StateGraph[MessagesState]:
        """シンプルなReActワークフロー"""
        langgraph_workflow = StateGraph[
            MessagesState, None, MessagesState, MessagesState
        ](MessagesState)
        langgraph_workflow.add_node("agent", self.agent)
        langgraph_workflow.add_edge(START, "agent")
        langgraph_workflow.add_edge("agent", END)
        return langgraph_workflow  # type: ignore[return-value]

    @property
    def prompt_template(self) -> ChatPromptTemplate:
        """{{topic}}などのテンプレート変数を受け取る"""
        return ChatPromptTemplate.from_messages(
            [
                ("user", "The topic is {{topic}}. タスクの説明をここに記述。"),
            ]
        )

    @property
    def agent(self) -> Any:
        """ReActパターンでMCPツールを自動的に使い分けるエージェント"""
        return create_react_agent(
            self.llm(preferred_model="datarobot/azure/gpt-5-mini-2025-08-07"),
            tools=self.mcp_tools,  # MCPツールが自動的に利用可能
            prompt=make_system_prompt(
                "あなたの役割と指示をここに記述。\n"
                "\n"
                "## 利用可能なツール\n"
                "- `tool_name_1`: ツールの説明\n"
                "- `tool_name_2`: ツールの説明\n"
                "\n"
                "## ワークフロー\n"
                "1. ステップ1の説明\n"
                "2. ステップ2の説明\n"
                "\n"
                "必要に応じてツールを使い分け、最適な結果を生成してください。"
            ),
            name="Agent Name",
        )
```

**ReActパターンの利点:**
- ✅ **自動ツール選択**: LLMが状況に応じて最適なツールを自動的に選択・実行
- ✅ **シンプルな実装**: 複雑なノードやエッジの定義が不要
- ✅ **柔軟性**: システムプロンプトの変更だけで振る舞いを調整可能
- ✅ **保守性**: コード量が少なく、理解・修正が容易

**エージェント出力のベストプラクティス:**

構造化されたデータ（リスト、複数フィールド、階層構造）をフロントエンドに返す場合は、**JSON形式での出力を強く推奨**します。

```python
@property
def prompt_template(self) -> ChatPromptTemplate:
    """JSON形式での出力を要求するプロンプト例"""
    return ChatPromptTemplate.from_messages(
        [
            ("user", 
             "以下の課題に対する解決策を提案してください。\n\n"
             "課題: {{pain_point}}\n\n"
             "**重要**: 必ず以下のJSON形式で回答してください：\n\n"
             "```json\n"
             "{\n"
             '  "proposals": [\n'
             "    {\n"
             '      "level": "lv1",\n'
             '      "levelName": "The Analyst (梅)",\n'
             '      "title": "レベル1のタイトル",\n'
             '      "description": "概要説明",\n'
             '      "whatAgentDoes": ["処理1", "処理2"],\n'
             '      "effortSaved": "削減される工数の説明",\n'
             '      "tools": ["ツール1", "ツール2"],\n'
             '      "estimatedCost": "¥XX,XXX〜¥XX,XXX/月",\n'
             '      "timeline": "X週間",\n'
             '      "humanRole": "人間の役割"\n'
             "    }\n"
             "  ]\n"
             "}\n"
             "```\n"
            ),
        ]
    )
```

**JSON出力の利点:**
- ✅ **データの完全性**: 文字数制限で途中で切れることがない
- ✅ **型安全性**: フロントエンドでTypeScriptの型定義と一致
- ✅ **保守性**: 正規表現によるパースよりも確実で、スキーマ変更が容易
- ✅ **追加ライブラリ不要**: react-markdownなどの追加依存がなくても複雑な構造を表現可能

#### 従来パターン: StateGraph + カスタムノード

**特殊な制御フローが必要な場合のみ使用してください。**MCPツールを使わない、または複雑な条件分岐・状態管理が必要な場合に適しています。

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated, List, Any
import operator
from langchain_core.messages import BaseMessage

# 1. Stateの定義
class AgentState(TypedDict):
    input: str
    chat_history: List[BaseMessage]
    intermediate_steps: Annotated[List[tuple], operator.add]

# 2. エージェントクラス
class MyAgent:
    def __init__(self):
        # グラフの初期化
        workflow = StateGraph(AgentState)
        
        # ノードの追加
        workflow.add_node("research", self.research_node)
        workflow.add_node("generate", self.generate_node)
        
        # エッジの定義
        workflow.set_entry_point("research")
        workflow.add_edge("research", "generate")
        workflow.add_edge("generate", END)
        
        self.app = workflow.compile()

    # 3. 必須のLLMラッパー
    def llm(self, preferred_model: str | None = None):
        # self.llm() を使用してモデルを取得
        pass

    # 4. ノード実装
    def research_node(self, state: AgentState):
        # ロジックの実装
        return {"intermediate_steps": [("research", "done")]}
        
    def generate_node(self, state: AgentState):
        # ロジックの実装
        return {"intermediate_steps": [("generate", "done")]}
```

**このパターンを使うべき場合:**
- 明示的な状態遷移が必要な複雑なワークフロー
- 条件分岐やループを含むフロー制御
- MCPツールを使用しない独自のロジック実装

### 3.2 MCP ツール統合パターン

エージェントに新しい機能を追加する場合は、**MCP (Model Context Protocol) サーバー経由でツールを統合**することを推奨します。

#### MCP ツールの作成方法

**1. ツールの定義 (mcp_server/app/tools/user_tools.py)**

新しいツールを定義します。MCPツールは通常通り複数の引数を持つことができます。

```python
from datarobot_genai.drmcp import dr_mcp_tool
import logging

logger = logging.getLogger(__name__)

@dr_mcp_tool(tags={"custom", "integration"})
async def my_custom_tool(argument1: str, argument2: int, options: dict = None) -> str:
    """
    カスタムツールの説明。LLMがこの説明を読んでツールの使い方を判断します。
    
    Args:
        argument1: 第一引数の説明
        argument2: 第二引数の説明
        options: オプションのパラメータ（辞書型）
    
    Returns:
        処理結果の説明
    """
    logger.info(f"Custom tool called with: {argument1}, {argument2}, {options}")
    
    # ここにツールのロジックを実装
    result = perform_operation(argument1, argument2, options)
    
    return result
```

**2. エージェントでの利用 (agent/agentic_workflow/agent.py)**

MCPツールは`self.mcp_tools`として自動的に利用可能になります。**ReActパターンと組み合わせることを強く推奨します。**

```python
from langgraph.prebuilt import create_react_agent
from datarobot_genai.core.agents import make_system_prompt

@property
def agent(self) -> Any:
    """ReActパターンでMCPツールを自動的に使い分けるエージェント"""
    return create_react_agent(
        self.llm(preferred_model="datarobot/azure/gpt-5-mini-2025-08-07"),
        tools=self.mcp_tools,  # MCPサーバーから取得されたツールが自動的に含まれる
        prompt=make_system_prompt(
            "あなたの役割の説明。\n"
            "\n"
            "## 利用可能なツール\n"
            "- `my_custom_tool`: ツールの簡単な説明\n"
            "\n"
            "必要に応じてツールを使用して、最適な結果を生成してください。"
        ),
        name="Agent Name",
    )
```

**重要な実装パターン:**
- ✅ **`@property`デコレーターを使用**: エージェントをプロパティとして定義
- ✅ **`preferred_model`を指定**: 明示的にモデルを指定（例: `"datarobot/azure/gpt-5-mini-2025-08-07"`）
- ✅ **`tools=self.mcp_tools`**: MCPツールを渡す（自動的に利用可能）
- ✅ **`make_system_prompt()`を使用**: システムプロンプトを適切に構築
- ✅ **ツールの説明をプロンプトに含める**: LLMがツールの使い方を理解できるように

#### MCP サーバーの設定

- MCP サーバーのポートは `.env` ファイルの `MCP_SERVER_PORT` で設定します（デフォルト: 9000）。
- インフラストラクチャ設定は `infra/infra/agent.py` の `get_mcp_custom_model_runtime_parameters()` で管理されます。

#### DataRobot ToolClient の直接利用（非推奨）

特別な理由がない限り、`ToolClient` の直接利用は避けてください。ただし、レガシーコードや特殊なケースでは以下のように使用できます。

```python
from datarobot_genai.tool import ToolClient

def tool_execution_node(self, state: AgentState):
    client = ToolClient(api_key=self.api_key, base_url=self.endpoint)
    result = client.execute_tool("tool_name", arguments={...})
    return {...}
```

**MCP ツールを使うメリット:**
- ✅ ツールの定義が一元管理される
- ✅ フロントエンドとの統合が容易
- ✅ ツールのテストが独立して可能
- ✅ デプロイ時の環境変数管理が簡単

## 4. エラーハンドリングとセキュリティ

**セキュリティ**: APIキー、アクセストークン、パスワードはいかなる場合もコードに埋め込まないでください。環境変数（`os.environ`）または設定オブジェクトから読み込んでください。

**例外処理**: LLMの呼び出しや外部API通信は失敗する可能性があります。`try-except` ブロックを使用し、エージェントがクラッシュせずに適切にエラー状態へ遷移するか、リトライを行うように設計してください。

## 5. テスト戦略とローカル実行

このアプリケーションテンプレートは、`task` コマンドを使用した統合テスト環境を提供しています。

### 5.1 Task コマンドによるテスト実行

**アプリケーション全体の起動**:
全コンポーネント（フロントエンド、バックエンド、エージェント、MCPサーバー）を同時に起動してE2Eテストを行う場合：

```bash
task dev
```

このコマンドは以下のサービスを自動的に起動します：
- Frontend Web: http://localhost:5173
- FastAPI Server: http://localhost:8080
- Agent: http://localhost:8842
- MCP Server: http://localhost:9000

**個別コンポーネントの起動**:
特定のコンポーネントのみをテストする場合：

```bash
task agent:dev           # エージェントのみ起動
task mcp_server:dev      # MCPサーバーのみ起動
task fastapi_server:dev  # FastAPIサーバーのみ起動
task frontend_web:dev    # フロントエンドのみ起動
```

### 5.2 Agent CLI による統合テスト

**自動起動モード (推奨)**:
開発サーバーを自動的に起動してテストを実行します。このモードでは、テスト完了後にサーバーが自動的に停止します。

```bash
# 単純な文字列入力でテスト
task agent:cli START_DEV=1 -- execute --user_prompt 'Tell me about Generative AI'

# JSON形式の入力でテスト
task agent:cli START_DEV=1 -- execute --user_prompt '{"topic": "Artificial Intelligence"}'

# ストリーミングレスポンスのテスト
task agent:cli START_DEV=1 -- execute --user_prompt 'Explain machine learning' --stream

# 完全な出力を表示
task agent:cli START_DEV=1 -- execute --user_prompt 'What is DataRobot?' --show_output
```

**手動起動モード**:
長時間のテストや複数回のテスト実行時は、手動でサーバーを起動しておく方が効率的です。

```bash
# 1. 別ターミナルでエージェントを起動
task agent:dev

# 2. テストを実行（START_DEV=1 は不要）
task agent:cli -- execute --user_prompt 'Tell me about Generative AI'
```

### 5.3 デプロイメントテスト

**カスタムモデルのテスト**:
DataRobot上にデプロイされたカスタムモデルをテストする場合：

```bash
task agent:cli -- execute-custom-model \
  --user_prompt 'Artificial Intelligence' \
  --custom_model_id <YOUR_CUSTOM_MODEL_ID>
```

**デプロイメントのテスト**:
DataRobot上にデプロイされたエージェントをテストする場合：

```bash
task agent:cli -- execute-deployment \
  --user_prompt 'Artificial Intelligence' \
  --deployment_id <YOUR_DEPLOYMENT_ID>

# ストリーミング有効
task agent:cli -- execute-deployment \
  --user_prompt 'Tell me about AI' \
  --deployment_id <YOUR_DEPLOYMENT_ID> \
  --stream
```

### 5.4 MCPツールのインタラクティブテスト

MCPサーバーのツールをインタラクティブにテストする場合：

```bash
task mcp:test-interactive
```

このコマンドは以下を実行します：
- MCPサーバーの起動
- AIエージェントとの接続
- 対話型チャットインターフェースの提供
- リアルタイムのデバッグ出力

### 5.5 テストコード記述時の推奨パターン

**既存のテストファイルの活用**:
新しいテストを追加する場合は、既存のテストファイル構造を尊重してください：

- **`agent/tests/test_mcp.py`**: エージェントとMCPツールの統合テストを含む既存ファイル
  - モックを使ったユニットテスト
  - `task` コマンドを使った実統合テスト
  - **新しいMCPツールのテストはこのファイルに追加することを推奨**

```python
# agent/tests/test_mcp.py に新しいテストクラスを追加する例

class TestNewMCPToolIntegration:
    """新しいMCPツールの統合テスト"""
    
    @pytest.mark.timeout(300)
    def test_new_tool_with_real_agent(self):
        """新しいツールの実統合テスト - task コマンド使用"""
        result = subprocess.run(
            [
                "task", "agent:cli", "START_DEV=1", "--",
                "execute",
                "--user_prompt", "新しいツールを使ってテスト"
            ],
            capture_output=True,
            text=True,
            timeout=300
        )
        
        assert result.returncode == 0, f"Command failed: {result.stderr}"
        assert "期待される結果" in result.stdout
        assert "Error" not in result.stderr
    
    @patch("datarobot_genai.langgraph.mcp.load_mcp_tools", new_callable=AsyncMock)
    def test_new_tool_with_mock(
        self, mock_load_mcp_tools, langgraph_common_mocks
    ):
        """新しいツールのモックテスト"""
        async def mock_new_tool(ctx, param: str):
            return {"result": f"Processed: {param}"}
        
        mock_new_tool.__name__ = "new_tool_name"
        mock_new_tool.__doc__ = "新しいツールの説明"
        
        mock_tools = [mock_new_tool]
        mock_load_mcp_tools.return_value = mock_tools
        langgraph_common_mocks.set_mcp_tools(mock_tools)
        
        with patch.dict(
            os.environ,
            {"EXTERNAL_MCP_URL": "http://localhost:9000/mcp"},
            clear=True
        ):
            agent = MyAgent(api_key="test_key", api_base="test_base", verbose=True)
            
            assert len(agent.mcp_tools) == 1
            assert agent.mcp_tools[0].__name__ == "new_tool_name"
            
            result = asyncio.run(
                agent.mcp_tools[0](ctx=None, param="test")
            )
            assert result["result"] == "Processed: test"
```

- **`mcp_server/app/tests/unit/`**: MCPツール自体の単体テストを配置
  - 新しいツールの機能テスト
  - エラーハンドリングのテスト
  - エージェントから独立したツールのロジック検証

```python
# mcp_server/app/tests/unit/test_user_tools.py に追加する例
import pytest
from app.tools.user_tools import new_custom_tool

class TestNewCustomTool:
    """新しいMCPツールの単体テスト"""
    
    @pytest.mark.asyncio
    async def test_valid_input(self):
        """有効な入力の処理テスト"""
        result = await new_custom_tool("valid_input")
        
        assert "expected_field" in result
        assert isinstance(result["expected_field"], str)
    
    @pytest.mark.asyncio
    async def test_invalid_input(self):
        """無効な入力のエラーハンドリング"""
        with pytest.raises(ValueError):
            await new_custom_tool("invalid_input")
    
    @pytest.mark.asyncio
    async def test_edge_case(self):
        """エッジケースの処理"""
        result = await new_custom_tool("")
        assert result is not None
```

**テストファイルの使い分け**:

1. **`agent/tests/test_mcp.py` を使う場合**:
   - ✅ エージェントがMCPツールを正しく呼び出せるか検証したい
   - ✅ `task agent:cli START_DEV=1` による実統合テストを行いたい
   - ✅ エージェントのワークフロー全体をテストしたい
   - ✅ 複数のMCPツールの連携動作を確認したい

2. **`mcp_server/app/tests/unit/` を使う場合**:
   - ✅ MCPツールの個別機能を単体テストしたい
   - ✅ ツールのロジックやエラーハンドリングを検証したい
   - ✅ エージェントから独立してツールをテストしたい
   - ✅ 高速な単体テストを書きたい

**統合テストの記述**:
エージェント全体の動作を検証する統合テストでは、`task` コマンドを使用したスクリプトテストを推奨します。

```python
# agent/tests/test_mcp.py に追加する統合テストの例
import subprocess
import json

class TestArchitectWorkflowIntegration:
    """Architectワークフローの統合テスト"""
    
    @pytest.mark.timeout(300)
    def test_agent_discovery_phase(self):
        """Discovery Phaseの統合テスト"""
        result = subprocess.run(
            [
                "task", "agent:cli", "START_DEV=1", "--",
                "execute",
                "--user_prompt", "企業URL: https://example.com を分析してください"
            ],
            capture_output=True,
            text=True,
            timeout=300
        )
        
        assert result.returncode == 0, f"Command failed: {result.stderr}"
        assert "企業情報" in result.stdout
        assert "課題" in result.stdout

    @pytest.mark.timeout(300)
    def test_agent_deep_dive_phase(self):
        """Deep Dive Phaseの統合テスト"""
        input_data = {
            "phase": "deep_dive",
            "discovered_pain_points": ["コスト削減", "効率化"]
        }
        
        result = subprocess.run(
            [
                "task", "agent:cli", "START_DEV=1", "--",
                "execute",
                "--user_prompt", json.dumps(input_data)
            ],
            capture_output=True,
            text=True,
            timeout=300
        )
        
        assert result.returncode == 0
        assert "Lv1" in result.stdout
        assert "Lv2" in result.stdout
        assert "Lv3" in result.stdout
```

**ユニットテストの記述**:
個別のノードやツールのテストは、従来のpytestパターンを使用します。

```python
# agent/tests/test_mcp.py のモックテストセクションに追加する例
import pytest
from agentic_workflow.agent import MyAgent

@pytest.fixture
def agent():
    return MyAgent()

def test_discover_research_node(agent, langgraph_common_mocks):
    """リサーチノードの単体テスト"""
    # モックMCPツールを設定
    mock_tools = [
        create_mock_mcp_tool("analyze_target_url"),
        create_mock_mcp_tool("search_web"),
    ]
    langgraph_common_mocks.set_mcp_tools(mock_tools)
    
    # ノードのテストロジック
    # ...
```

### 5.6 CI/CDでのテスト実行

GitHub ActionsなどのCI環境では、`START_DEV=1` モードを使用して自動テストを実行できます：

```yaml
# .github/workflows/agent-integration-test.yml
- name: Run Agent Integration Tests
  run: |
    task agent:cli START_DEV=1 -- execute --user_prompt 'Test prompt'
```

### 5.7 テスト時の注意事項

**環境変数の設定**:
テスト実行前に `.env` ファイルが正しく設定されていることを確認してください。特に以下の変数が必須です：
- `DATAROBOT_API_TOKEN`
- `DATAROBOT_ENDPOINT`
- `LLM_DEPLOYMENT_ID` または `LLM_DEFAULT_MODEL`

**ポートの競合**:
複数のテストを並行実行する場合、ポートの競合に注意してください。`START_DEV=1` モードでは自動的にポートのクリーンアップが行われますが、手動起動の場合は明示的に停止が必要です。

```bash
# エージェント開発サーバーの停止
task agent:dev-stop

# 全てのローカルプロセスをクリーンアップ
pkill -f "uv run python dev.py"
pkill -f "uvicorn app.main:app"
```

**タイムアウトの設定**:
LLMを使用するテストは時間がかかる可能性があるため、適切なタイムアウトを設定してください：

```python
@pytest.mark.timeout(300)  # 5分のタイムアウト
def test_long_running_agent():
    # ...
```

## 6. 重要な教訓とアンチパターン（2026年1月15日追記）

### 6.1 Phase 3失敗の根本原因

Phase 3のフロントエンド開発で発生した問題の**根本原因は1つだけ**でした：

**❌ フロントエンドからJSON文字列をエージェントに送信したこと**

これにより以下の連鎖的な問題が発生：
1. JSON文字列を解析するために`convert_input_message`をオーバーライド
2. カスタムState（`ArchitectState`）を定義して複雑な状態管理を実装
3. DataRobotのストリーミング処理と非互換になり`ValueError: Invalid message event`

### 6.2 本当にやってはいけないこと（入口の問題）

#### 🚫 **アンチパターン: フロントエンドからJSON文字列を送信**

#### 🚫 **アンチパターン: フロントエンドからJSON文字列を送信**

**やってはいけないこと:**
```typescript
// ❌ BAD: フロントエンドからJSON文字列を送信
const input = JSON.stringify({
  target_url: "https://example.com",
  department: "営業部",
  pain_point: "コスト削減",
  phase: "discover"
});
await sendMessage(input);  // これが問題の根源
```

**なぜダメなのか:**
- エージェントの入口（ユーザー入力）がJSON文字列だと、パース処理が必要になる
- パース処理のために`convert_input_message`をオーバーライドしたくなる
- カスタムStateを定義したくなる
- DataRobotのストリーミング処理と非互換になる

**正しいパターン:**
```typescript
// ✅ GOOD: シンプルなプレーンテキスト送信
await sendMessage("企業URL: https://example.com を分析してください");

// ✅ GOOD: 会話の流れで情報を伝える
await sendMessage("企業URL: https://example.com");
await sendMessage("部署: 営業部");
await sendMessage("既知の課題: コスト削減");
await sendMessage("上記の情報で企業分析を開始してください");

// ✅ GOOD: 自然言語で全て含める
await sendMessage("企業URL https://example.com の営業部について分析してください。既知の課題はコスト削減です。");
```

### 6.3 実は問題なかったこと（誤解を解く）

以下は**問題ではありませんでした**：

#### ✅ **カスタムノードの使用（問題なし）**

```python
# ✅ GOOD: MessagesStateを使えばカスタムノードは問題ない
class MyAgent(LangGraphAgent):
    @property
    def workflow(self) -> StateGraph[MessagesState]:
        workflow = StateGraph[MessagesState, None, MessagesState, MessagesState](MessagesState)
        
        # カスタムノードは自由に定義できる
        workflow.add_node("parse_input", self.parse_input_node)
        workflow.add_node("router", self.router_node)
        workflow.add_node("researcher", self.research_node)
        workflow.add_node("generator", self.generate_node)
        
        # 複雑なフローも問題ない
        workflow.add_edge(START, "parse_input")
        workflow.add_conditional_edges("router", self.route_decision, {...})
        
        return workflow
    
    def parse_input_node(self, state: MessagesState):
        # ノード内部での状態管理は自由
        messages = state["messages"]
        last_message = messages[-1].content
        
        # プレーンテキストからパラメータを抽出（LLMや正規表現で）
        # ...
        
        return {"messages": [AIMessage(content="分析を開始します")]}
```

**重要なポイント:**
- StateGraphの型は`MessagesState`を使う（カスタムStateDefは避ける）
- ノード内部での状態管理は自由（変数、辞書、クラスなど）
- 複雑なフロー制御も問題ない

#### ✅ **エージェント内部でのJSON処理（問題なし）**

```python
# ✅ GOOD: ノード内部でJSONを生成・処理するのは問題ない
def research_node(self, state: MessagesState):
    # MCPツールにJSON形式で渡すのは問題ない
    result = self.call_mcp_tool("analyze_target_url", {
        "target_url": extracted_url,
        "options": {"deep_analysis": True}
    })
    
    # 内部的にJSON形式でデータを保持するのも問題ない
    analysis_data = {
        "company_name": result.get("name"),
        "pain_points": result.get("pain_points", []),
        "ai_maturity": result.get("ai_maturity")
    }
    
    # MessagesStateに結果を追加
    return {"messages": [AIMessage(content=format_report(analysis_data))]}
```

### 6.4 推奨アーキテクチャパターン

#### パターン1: ReActパターン（シンプル、推奨）

```python
class MyAgent(LangGraphAgent):
    @property
    def workflow(self) -> StateGraph[MessagesState]:
        workflow = StateGraph[MessagesState, None, MessagesState, MessagesState](MessagesState)
        workflow.add_node("agent", self.agent)
        workflow.add_edge(START, "agent")
        workflow.add_edge("agent", END)
        return workflow
    
    @property
    def agent(self) -> Any:
        return create_react_agent(
            self.llm(preferred_model="datarobot/azure/gpt-4o-mini-2024-07-18"),
            tools=self.mcp_tools,
            prompt=make_system_prompt("詳細な指示..."),
            name="Agent Name",
        )
```

**メリット:**
- シンプルで保守しやすい
- ツールの選択をLLMに任せられる
- デバッグが容易

#### パターン2: カスタムノード（複雑なフロー向け）

```python
class MyAgent(LangGraphAgent):
    @property
    def workflow(self) -> StateGraph[MessagesState]:
        workflow = StateGraph[MessagesState, None, MessagesState, MessagesState](MessagesState)
        
        workflow.add_node("parse", self.parse_node)
        workflow.add_node("route", self.route_node)
        workflow.add_node("phase1", self.phase1_node)
        workflow.add_node("phase2", self.phase2_node)
        
        workflow.add_edge(START, "parse")
        workflow.add_edge("parse", "route")
        workflow.add_conditional_edges("route", self.decide_phase, {
            "phase1": "phase1",
            "phase2": "phase2"
        })
        workflow.add_edge("phase1", END)
        workflow.add_edge("phase2", END)
        
        return workflow
```

**メリット:**
- 明示的なフロー制御
- 特定のノードで特定のツールを使用
- デバッグポイントが明確

**注意:**
- 必ず`MessagesState`を使用
- ノードは新しいメッセージのみ返す

### 6.5 実装時のチェックリスト

- [ ] **フロントエンドはプレーンテキスト送信**: JSON文字列を送らない
- [ ] **StateGraphの型はMessagesState**: カスタムTypeDefを使わない
- [ ] **ノードの戻り値はメッセージリスト**: `{"messages": [AIMessage(...)]}`
- [ ] **会話履歴を活用**: state["messages"]から情報を取得
- [ ] **ノード内部の状態管理は自由**: 変数、辞書、クラスなど好きに使える

### 6.6 トラブルシューティング

**症状: `ValueError: Invalid message event`**
- 原因: カスタムState（TypeDict）を`StateGraph`の型引数に使っている
- 解決: `StateGraph[MessagesState, None, MessagesState, MessagesState](MessagesState)`に変更

**症状: エージェントが入力を理解しない**
- 原因: フロントエンドがJSON文字列を送信している
- 解決: プレーンテキストに変更

**症状: ノード間で情報を共有できない**
- 原因: ノード内部で状態管理していないか、MessagesStateを使っていない
- 解決: state["messages"]から必要な情報を抽出、またはノード内部で辞書/クラスで管理

### 6.7 まとめ

**本当の問題:**
- ❌ フロントエンドからJSON文字列を送信したこと（入口の問題）

**誤解していたこと:**
- ✅ カスタムノードは問題ない（MessagesStateを使えば）
- ✅ 複雑なフロー制御は問題ない
- ✅ ノード内部でのJSON処理は問題ない
- ✅ ReActパターン以外も使える

**正しい方針:**
1. フロントエンドは**必ずプレーンテキスト**で送信
2. StateGraphの型は**必ずMessagesState**を使用
3. ノード内部の実装は自由（シンプルならReAct、複雑ならカスタムノード）
