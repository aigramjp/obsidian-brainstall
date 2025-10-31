import {
	Notice,
	Plugin,
	TFile,
	ItemView,
	PluginSettingTab,
	Setting,
	App,
	WorkspaceLeaf,
	MarkdownView,
	MarkdownRenderer,
	Platform,
	FuzzySuggestModal,
} from "obsidian";

const VIEW_TYPE = "brainstall-view";

// ファイル選択モーダル
class FileSelectModal extends FuzzySuggestModal<TFile> {
	constructor(app: App, items: TFile[], onChoose: (file: TFile) => void) {
		super(app);
		this.items = items;
		this.onChooseCallback = onChoose;
	}

	private items: TFile[];
	private onChooseCallback: (file: TFile) => void;

	getItems(): TFile[] {
		return this.items;
	}

	getItemText(item: TFile): string {
		return item.basename;
	}

	onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent): void {
		this.onChooseCallback(item);
	}
}

interface BrainstallSettings {
	notificationFolder: string;
	provider: string;
	openaiApiKey: string;
	claudeApiKey: string;
	groqApiKey: string;
	model: string;
	analysisFolder: string;
	timestampFormat: string; // "YYYYMMDD_HHmmss" or "ISO"
}

const MODEL_LIST = {
	openai: [
		{ id: "o1", name: "o1" },
		{ id: "o1-preview", name: "o1-preview" },
		{ id: "o1-mini", name: "o1-mini" },
		{ id: "gpt-4o", name: "gpt-4o" },
		{ id: "gpt-4o-mini", name: "gpt-4o-mini" },
		{ id: "gpt-4.5-preview", name: "gpt-4.5-preview" },
		{ id: "gpt-4.1", name: "gpt-4.1" },
		{ id: "gpt-4.1-nano", name: "gpt-4.1-nano" },
		{ id: "gpt-4.1-mini", name: "gpt-4.1-mini" },
		{ id: "gpt-5", name: "gpt-5" },
		{ id: "gpt-5-mini", name: "gpt-5-mini" },
		{ id: "gpt-4-turbo", name: "gpt-4-turbo" },
		{ id: "gpt-4", name: "gpt-4" },
		{ id: "gpt-3.5-turbo", name: "gpt-3.5-turbo" },
	],
	groq: [
		{ id: "qwen/qwen3-32b", name: "qwen3-32b" },
		{ id: "llama-3.1-8b-instant", name: "llama-3.1-8b" },
		{ id: "llama-3.3-70b-versatile", name: "llama-3.3-70b" },
		{
			id: "meta-llama/llama-4-scout-17b-16e-instruct",
			name: "llama-4-scout-17b",
		},
		{
			id: "meta-llama/llama-4-maverick-17b-128e-instruct",
			name: "llama-4-maverick-17b",
		},
		{ id: "qwen-qwq-32b", name: "qwen-qwq-32b" },
	],
	claude: [
		{ id: "claude-3-7-sonnet-20250219", name: "claude-3-7-sonnet" },
		{ id: "claude-3-sonnet-20240229", name: "claude-3-sonnet" },
		{ id: "claude-3-opus-latest", name: "claude-3-opus" },
		{ id: "claude-3-haiku-20240307", name: "claude-3-haiku" },
		{ id: "claude-3-5-sonnet-latest", name: "claude-3-5-sonnet" },
		{ id: "claude-3-5-haiku-latest", name: "claude-3-5-haiku" },
		{ id: "claude-sonnet-4-20250514", name: "claude-sonnet-4" },
		{ id: "claude-haiku-4-5-20251001", name: "claude-haiku-4.5" },
		{ id: "claude-opus-4-20250514", name: "claude-opus-4" },
		{ id: "claude-opus-4-1-20250805", name: "claude-opus-4.1" },
	],
};

const DEFAULT_SETTINGS: BrainstallSettings = {
	notificationFolder: "Archives/Notifications",
	provider: "openai",
	openaiApiKey: "",
	claudeApiKey: "",
	groqApiKey: "",
	model: "gpt-4o-mini",
	analysisFolder: "Topics",
	timestampFormat: "YYYYMMDD_HHmmss",
};

class BrainstallView extends ItemView {
	private grassContainer: HTMLDivElement;
	private postsContainer: HTMLDivElement;
	private statsContainer: HTMLDivElement;
	private referenceContainer: HTMLDivElement;
	private contentContainer: HTMLDivElement;
	private inputContainer: HTMLDivElement;
	private notificationSectionContainer: HTMLDivElement;
	private showArchived: boolean = false;
	private searchKeyword: string = "";
	private searchDate: string = "";
	private searchType: string = "";
	private selectedPriorities: number[] = []; // 選択された星の数の配列（空の場合は全て表示）
	private saveListeners: Array<() => void> = [];
	private isInputVisible: boolean = false;
	private floatingButton: HTMLButtonElement | null = null;
	private inputOverlay: HTMLDivElement | null = null;
	private inputResizeHandler: (() => void) | null = null;
	private inputViewportHandler: ((e: Event) => void) | null = null;
	private activeFileDisplay: HTMLDivElement | null = null;
	private selectedFile: TFile | null | undefined = undefined; // 手動で選択されたファイル (undefined=初期状態, null=クリア済み)
	private clearFileBtn: HTMLButtonElement | null = null; // クリアボタン
	private fileDisplayContent: HTMLSpanElement | null = null; // ファイル名表示用
	private deepDiveButton: HTMLButtonElement | null = null; // 深掘りボタン

	constructor(leaf: WorkspaceLeaf, private plugin: MyPlugin) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE;
	}

	getDisplayText() {
		return "Brainstall";
	}

	getIcon() {
		return "brain";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

		// 通知セクションのコンテナ
		this.notificationSectionContainer = container.createEl("div", {
			cls: "notification-section",
		});

		// 入力セクション
		this.inputContainer = this.notificationSectionContainer.createEl(
			"div",
			{
				cls: "brainstall-input-section",
			}
		);
		// 初期状態では非表示
		this.inputContainer.addClass("hidden");

		// アクティブファイル表示エリア
		this.activeFileDisplay = this.inputContainer.createEl("div", {
			cls: "brainstall-active-file-display",
		});
		this.activeFileDisplay.style.cursor = "pointer";
		this.activeFileDisplay.style.display = "flex";
		this.activeFileDisplay.style.alignItems = "center";
		this.activeFileDisplay.style.overflow = "hidden";
		this.activeFileDisplay.style.padding = "8px 30px 8px 12px"; // top right bottom left - クリアボタンのスペース
		this.activeFileDisplay.setAttribute(
			"title",
			"クリックしてファイルを選択"
		);

		// ファイル名表示用のコンテナ
		this.fileDisplayContent = this.activeFileDisplay.createEl("span", {
			cls: "brainstall-active-file-content",
		});
		this.fileDisplayContent.style.flex = "1";
		this.fileDisplayContent.style.minWidth = "0";
		this.fileDisplayContent.style.maxWidth = "calc(100% - 32px)"; // クリアボタン（24px幅 + right:8px = 32px）のスペースを確保
		this.fileDisplayContent.style.overflow = "hidden";
		this.fileDisplayContent.style.textOverflow = "ellipsis";
		this.fileDisplayContent.style.whiteSpace = "nowrap";

		// クリアボタン（閉じるボタンと同じ方法で追加）
		this.clearFileBtn = this.activeFileDisplay.createEl("button", {
			cls: "brainstall-clear-file-btn",
		}) as HTMLButtonElement;
		this.clearFileBtn.textContent = "×";
		this.clearFileBtn.setAttribute("title", "選択をクリア");
		this.clearFileBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation(); // 親要素のクリックイベントを防ぐ
			this.selectedFile = null;
			this.updateActiveFileDisplay();
		});

		// ファイル検索モーダルを開く
		this.activeFileDisplay.addEventListener("click", (e) => {
			// クリアボタンがクリックされた場合はモーダルを開かない
			if (
				(e.target as HTMLElement).closest(".brainstall-clear-file-btn")
			) {
				return;
			}
			const files = this.app.vault.getMarkdownFiles();
			const modal = new FileSelectModal(
				this.app,
				files,
				(file: TFile) => {
					this.selectedFile = file;
					this.updateActiveFileDisplay();
					// 参照タブが表示されている場合は更新
					if (
						this.referenceContainer &&
						!this.referenceContainer.hasClass("hidden")
					) {
						this.updateReference();
					}
				}
			);
			modal.open();
		});

		// ワークスペースのアクティブファイル変更を監視
		this.app.workspace.on("active-leaf-change", () => {
			// 手動で選択されていない場合（undefined）のみ、新しいアクティブファイルに追従
			if (this.selectedFile === undefined) {
				this.updateActiveFileDisplay();
				// 参照タブが表示されている場合は更新
				if (
					this.referenceContainer &&
					!this.referenceContainer.hasClass("hidden")
				) {
					this.updateReference();
				}
			}
		});

		// 初期表示を更新
		this.updateActiveFileDisplay();

		// textareaをラップするコンテナを作成（閉じるボタンを配置するため）
		const textareaWrapper = this.inputContainer.createEl("div", {
			cls: "brainstall-textarea-wrapper",
		});

		const textarea = textareaWrapper.createEl("textarea", {
			cls: "brainstall-input",
		});
		(textarea as HTMLTextAreaElement).rows = 5;
		// placeholderを設定（改行は改行文字で表示される）
		(textarea as HTMLTextAreaElement).placeholder =
			"タイトル\n概要\n#キーワード";
		// iOSの自動ズームを防ぐため、readonly属性を一時的に設定
		textarea.setAttribute("readonly", "readonly");
		// フォーカス時にreadonlyを外す（iOSの自動ズーム対策）
		// 毎回実行されるようにonce: trueを削除
		textarea.addEventListener("focus", () => {
			setTimeout(() => {
				textarea.removeAttribute("readonly");
			}, 0);
		});

		// 閉じるボタンをtextareaWrapper内に追加（textareaの右下に重ねるため）
		const closeButton = textareaWrapper.createEl("button", {
			cls: "brainstall-input-close-btn",
			text: "✕",
			attr: { title: "閉じる" },
		});
		closeButton.addEventListener("click", () => {
			this.toggleInputSection();
		});

		const buttonContainer = this.inputContainer.createEl("div", {
			cls: "brainstall-input-buttons",
		});

		const submitBtn = buttonContainer.createEl("button", {
			text: "📝 メモ",
			cls: "brainstall-submit-btn",
		}) as HTMLButtonElement;

		// 初期状態では無効化
		submitBtn.disabled = true;

		submitBtn.addEventListener("click", () => {
			const content = (textarea as HTMLTextAreaElement).value;
			// 選択されたファイルまたはアクティブファイルをsourceとして使用
			const sourceFile =
				this.selectedFile || this.app.workspace.getActiveFile();
			this.handleSubmitContent(content, sourceFile);
			(textarea as HTMLTextAreaElement).value = "";
			// ボタン状態を更新
			updateButtonStates();
		});

		// リスト化ボタン
		const listifyBtn = buttonContainer.createEl("button", {
			text: "📋 リスト化",
			cls: "brainstall-listify-btn mod-cta",
		}) as HTMLButtonElement;

		// 初期状態では無効化
		listifyBtn.disabled = true;

		// 深掘りボタン
		this.deepDiveButton = buttonContainer.createEl("button", {
			text: "🔍 深掘り",
			cls: "brainstall-deep-dive-btn mod-cta",
		}) as HTMLButtonElement;

		// 初期状態では無効化
		this.deepDiveButton.disabled = true;

		// ボタンの状態を更新する関数
		const updateButtonStates = () => {
			const hasContent =
				(textarea as HTMLTextAreaElement).value.trim().length > 0;
			submitBtn.disabled = !hasContent;
			listifyBtn.disabled = !hasContent;
			if (this.deepDiveButton) {
				this.deepDiveButton.disabled = !hasContent;
			}
		};

		// テキストエリアの変更を監視
		textarea.addEventListener("input", updateButtonStates);

		// wikilink挿入機能: [[を入力したらファイル選択モーダルを開く
		let previousValue = "";
		textarea.addEventListener("input", (e: InputEvent) => {
			const target = e.target as HTMLTextAreaElement;
			const currentValue = target.value;
			const cursorPos = target.selectionStart;
			const textBeforeCursor = currentValue.substring(0, cursorPos);

			// 文字が追加された場合のみチェック（削除時は無視）
			// inputTypeで判定、または値の長さで判定
			const isInsertion =
				currentValue.length > previousValue.length ||
				e.inputType === "insertText" ||
				e.inputType === "insertCompositionText" ||
				!e.inputType; // inputTypeが無い場合（一部のブラウザ）

			// 最後の2文字が[[で、かつ文字が追加された場合のみ
			if (textBeforeCursor.endsWith("[[") && isInsertion) {
				// [[の位置を記録
				const linkStartPos = cursorPos - 2;

				// [[を[[]]に変換（キャンセル時に残るように）
				const textBefore = target.value.substring(0, linkStartPos);
				const textAfter = target.value.substring(cursorPos);
				target.value = textBefore + "[[]]" + textAfter;
				target.selectionStart = linkStartPos + 2; // [[]]の真ん中（[]の間）にカーソル
				target.selectionEnd = linkStartPos + 2;

				// ファイル選択モーダルを開く
				const files = this.app.vault.getMarkdownFiles();
				let fileSelected = false;
				const modal = new FileSelectModal(
					this.app,
					files,
					(file: TFile) => {
						fileSelected = true;
						// ファイル選択後、[[]]を[[ファイル名]]に置き換え
						const beforeText = target.value.substring(
							0,
							linkStartPos
						);
						const afterText = target.value.substring(
							linkStartPos + 4
						); // [[]]の4文字をスキップ
						const insertText = `[[${file.basename}]]`;

						target.value = beforeText + insertText + afterText;
						// カーソルを]]の後ろに移動
						const newCursorPos = linkStartPos + insertText.length;
						target.selectionStart = newCursorPos;
						target.selectionEnd = newCursorPos;

						// ボタン状態を更新
						updateButtonStates();

						// フォーカスを維持
						target.focus();
					}
				);

				// モーダルが閉じられた時（キャンセル時）の処理
				const originalClose = modal.onClose?.bind(modal);
				if (originalClose) {
					modal.onClose = () => {
						originalClose();
						if (!fileSelected) {
							// キャンセルされた場合、[[]]はそのまま残す（カーソル位置を調整）
							target.selectionStart = linkStartPos + 2;
							target.selectionEnd = linkStartPos + 2;
							target.focus();
						}
					};
				}

				modal.open();
			}

			// 前回の値を更新
			previousValue = currentValue;
		});

		listifyBtn.addEventListener("click", async () => {
			const content = (textarea as HTMLTextAreaElement).value;
			if (!content.trim()) {
				new Notice("テキストを入力してください");
				return;
			}

			// APIキーのチェック
			if (!this.checkApiKey()) {
				return;
			}

			// すぐにtextareaをクリア
			(textarea as HTMLTextAreaElement).value = "";
			// ボタン状態を更新
			updateButtonStates();

			// 処理中のスケルトン通知を表示
			const skeletonNotice = new Notice(
				`📋 リスト化処理中: 「${content}」`,
				0
			);

			// 通知リストに処理中スケルトンを追加
			const skeletonId = `skeleton-${Date.now()}-${Math.random()}`;

			let skeletonEl: HTMLElement | null = null;

			// postsListがまだ存在しない場合は作成
			let postsList = this.postsContainer.querySelector(
				".brainstall-posts-list"
			) as HTMLElement;

			if (!postsList) {
				postsList = this.postsContainer.createEl("div", {
					cls: "brainstall-posts-list",
				});
			}

			if (postsList) {
				skeletonEl = postsList.createEl("div", {
					cls: "brainstall-post skeleton",
				});
				skeletonEl.setAttribute("data-skeleton-id", skeletonId);

				skeletonEl.createEl("div", {
					text: "📋 リスト化処理中",
					cls: "brainstall-post-date",
				});
				skeletonEl.createEl("div", {
					text: `「${content}」のチェックリストを作成中...`,
					cls: "brainstall-post-content",
				});

				// スケルトンアニメーション用の行を追加
				for (let i = 0; i < 3; i++) {
					const line = skeletonEl.createEl("div", {
						cls: "brainstall-skeleton-line",
					});
					line.style.width = `${80 - i * 10}%`;
				}
				// 先頭に挿入
				postsList.insertBefore(skeletonEl, postsList.firstChild);
			}

			try {
				const result = await this.handleListifyContent(content);

				if (result) {
					// スケルトンを削除（保存の前に）
					if (skeletonEl && skeletonEl.parentNode) {
						skeletonEl.remove();
					}

					// リストを更新
					await this.updatePosts();

					skeletonNotice.hide();
					new Notice(`✅ リスト化完了: 「${content}」`);
				} else {
					// スケルトンを削除（IDで特定）
					const currentPostsList = this.postsContainer.querySelector(
						".brainstall-posts-list"
					);
					const skeletonToRemove = currentPostsList?.querySelector(
						`[data-skeleton-id="${skeletonId}"]`
					);
					skeletonToRemove?.remove();
					skeletonNotice.hide();
					new Notice("❌ リスト化に失敗しました");
				}
			} catch (error) {
				// スケルトンを削除（IDで特定）
				const currentPostsList = this.postsContainer.querySelector(
					".brainstall-posts-list"
				);
				const skeletonToRemove = currentPostsList?.querySelector(
					`[data-skeleton-id="${skeletonId}"]`
				);
				skeletonToRemove?.remove();
				skeletonNotice.hide();
				console.error("Listify error:", error);
				new Notice("❌ エラーが発生しました");
			}
		});

		this.deepDiveButton.addEventListener("click", async () => {
			const content = (textarea as HTMLTextAreaElement).value;
			if (!content.trim()) {
				new Notice("テキストを入力してください");
				return;
			}

			// APIキーのチェック
			if (!this.checkApiKey()) {
				return;
			}

			if (!this.deepDiveButton) return;

			// すぐにtextareaをクリア
			(textarea as HTMLTextAreaElement).value = "";
			// ボタン状態を更新
			updateButtonStates();

			// 処理中のスケルトン通知を表示
			const skeletonNotice = new Notice(
				`🔍 深掘り処理中: 「${content}」`,
				0
			);

			// 通知リストに処理中スケルトンを追加
			const skeletonId = `skeleton-${Date.now()}-${Math.random()}`;

			let skeletonEl: HTMLElement | null = null;

			// postsListがまだ存在しない場合は作成
			let postsList = this.postsContainer.querySelector(
				".brainstall-posts-list"
			) as HTMLElement;

			if (!postsList) {
				postsList = this.postsContainer.createEl("div", {
					cls: "brainstall-posts-list",
				});
			}

			if (postsList) {
				skeletonEl = postsList.createEl("div", {
					cls: "brainstall-post skeleton",
				});
				skeletonEl.setAttribute("data-skeleton-id", skeletonId);

				skeletonEl.createEl("div", {
					text: "🔍 深掘り処理中",
					cls: "brainstall-post-date",
				});
				skeletonEl.createEl("div", {
					text: `「${content}」に関する記事を作成中...`,
					cls: "brainstall-post-content",
				});
				// スケルトンアニメーション用の行を追加
				for (let i = 0; i < 3; i++) {
					const line = skeletonEl.createEl("div", {
						cls: "brainstall-skeleton-line",
					});
					line.style.width = `${80 - i * 10}%`;
				}
				// 先頭に挿入
				postsList.insertBefore(skeletonEl, postsList.firstChild);
			}

			try {
				const result = await this.handleDeepDiveContent(content);

				if (result && result.content) {
					// スケルトンを削除（保存の前に）
					if (skeletonEl && skeletonEl.parentNode) {
						skeletonEl.remove();
					}

					// 結果を保存
					await this.saveDeepDiveArticle(
						content,
						result.title,
						result.content
					);

					// リストを更新
					await this.updatePosts();

					// 成功通知
					skeletonNotice.hide();
					new Notice(`✅ 深掘り完了: 「${content}」`);
				} else {
					// スケルトンを削除（IDで特定）
					const currentPostsList = this.postsContainer.querySelector(
						".brainstall-posts-list"
					);
					const skeletonToRemove = currentPostsList?.querySelector(
						`[data-skeleton-id="${skeletonId}"]`
					);
					skeletonToRemove?.remove();
					skeletonNotice.hide();
					new Notice("❌ 深掘りに失敗しました");
				}
			} catch (error) {
				// スケルトンを削除（IDで特定）
				const currentPostsList = this.postsContainer.querySelector(
					".brainstall-posts-list"
				);
				const skeletonToRemove = currentPostsList?.querySelector(
					`[data-skeleton-id="${skeletonId}"]`
				);
				skeletonToRemove?.remove();
				skeletonNotice.hide();
				console.error("DeepDive error:", error);
				new Notice("❌ エラーが発生しました");
			}
		});

		// 通知セクションのコンテンツエリア
		const notificationContent = this.notificationSectionContainer.createEl(
			"div",
			{
				cls: "brainstall-content",
			}
		);
		this.contentContainer = notificationContent; // 後方互換性のため

		// 投稿一覧
		this.postsContainer = notificationContent.createEl("div", {
			cls: "brainstall-posts active",
		});

		// 統計コンテナ（進捗の草も含む）
		this.statsContainer = notificationContent.createEl("div", {
			cls: "brainstall-stats hidden",
		});

		// 草を生やす場所（統計コンテナ内に移動）
		this.grassContainer = this.statsContainer.createEl("div", {
			cls: "brainstall-grass",
		});

		// 参照コンテナ
		this.referenceContainer = notificationContent.createEl("div", {
			cls: "brainstall-reference hidden",
		});

		// タブ（通知セクション用）- 下部に配置（最後に追加）
		const notificationTabs = this.notificationSectionContainer.createEl(
			"div",
			{
				cls: "brainstall-tabs",
			}
		);

		// タブボタン
		const postsTab = notificationTabs.createEl("button", {
			cls: "brainstall-tab active",
			attr: { "data-tab": "posts" },
		});
		const postsIcon = postsTab.createEl("span", {
			text: "📬",
			cls: "brainstall-tab-icon",
		});
		const postsLabel = postsTab.createEl("span", {
			text: "受信箱",
			cls: "brainstall-tab-label",
		});

		const statsTab = notificationTabs.createEl("button", {
			cls: "brainstall-tab",
			attr: { "data-tab": "stats" },
		});
		const statsIcon = statsTab.createEl("span", {
			text: "📊",
			cls: "brainstall-tab-icon",
		});
		const statsLabel = statsTab.createEl("span", {
			text: "統計",
			cls: "brainstall-tab-label",
		});

		const referenceTab = notificationTabs.createEl("button", {
			cls: "brainstall-tab",
			attr: { "data-tab": "reference" },
		});
		const referenceIcon = referenceTab.createEl("span", {
			text: "🔗",
			cls: "brainstall-tab-icon",
		});
		const referenceLabel = referenceTab.createEl("span", {
			text: "参照",
			cls: "brainstall-tab-label",
		});

		// タブ切り替えイベント
		postsTab.addEventListener("click", () => this.switchTab("posts"));
		statsTab.addEventListener("click", () => this.switchTab("stats"));
		referenceTab.addEventListener("click", () =>
			this.switchTab("reference")
		);

		// 右下に固定されたボタンを作成
		this.floatingButton = container.createEl("button", {
			cls: "brainstall-floating-button",
			text: "✏️",
			attr: { title: "入力欄を開く" },
		}) as HTMLButtonElement;
		this.floatingButton.addEventListener("click", () => {
			this.toggleInputSection();
		});

		// 入力欄の外をタップした時に閉じるためのオーバーレイを作成（使用しないが、削除はしない）
		this.inputOverlay = container.createEl("div", {
			cls: "brainstall-input-overlay hidden",
		});
		// オーバーレイを透過にして、後ろの要素を操作できるようにする
		this.inputOverlay.style.pointerEvents = "none";

		// 初期化
		await this.updatePosts();
		await this.updateStats();
	}

	updateActiveFileDisplay() {
		if (!this.fileDisplayContent) return;

		let fileToDisplay: TFile | null = null;

		// selectedFileがundefined（初期状態）の場合はアクティブファイルを使用
		// selectedFileがnull（クリア済み）の場合は何も表示しない
		// selectedFileがTFile（手動選択済み）の場合はそのファイルを表示
		if (this.selectedFile !== undefined) {
			fileToDisplay = this.selectedFile;
		} else {
			fileToDisplay = this.app.workspace.getActiveFile();
		}

		if (fileToDisplay) {
			this.fileDisplayContent.textContent = `📄 ${fileToDisplay.basename}`;
			// ファイルが選択されている場合はクリアボタンを表示
			if (this.clearFileBtn) {
				this.clearFileBtn.style.display = "flex";
			}
		} else {
			this.fileDisplayContent.textContent =
				"📄 リンク元ファイルが選択されていません";
			// ファイルが選択されていない場合はクリアボタンを非表示
			if (this.clearFileBtn) {
				this.clearFileBtn.style.display = "none";
			}
		}

		this.activeFileDisplay!.style.display = "block";

		// 参照タブが表示されている場合は更新
		if (
			this.referenceContainer &&
			!this.referenceContainer.hasClass("hidden")
		) {
			this.updateReference();
		}
	}

	toggleInputSection() {
		this.isInputVisible = !this.isInputVisible;
		if (this.isInputVisible) {
			// アクティブファイル表示を更新
			this.updateActiveFileDisplay();

			// スクロール位置を保存（入力欄を開く前に）
			const activePostsList = this.postsContainer?.querySelector(
				".brainstall-posts-list"
			);
			const savedScrollTop = activePostsList
				? (activePostsList as HTMLElement).scrollTop
				: 0;

			this.inputContainer.removeClass("hidden");
			this.inputContainer.addClass("visible");
			// ランチャーボタンを非表示にする
			if (this.floatingButton) {
				this.floatingButton.addClass("hidden");
			}
			// オーバーレイを表示
			if (this.inputOverlay) {
				this.inputOverlay.removeClass("hidden");
			}

			// 入力欄の高さを測定してpaddingを設定（一度だけ）
			const setPadding = () => {
				if (
					!this.isInputVisible ||
					this.inputContainer.hasClass("hidden")
				) {
					return;
				}

				const inputSectionRect =
					this.inputContainer.getBoundingClientRect();
				const inputHeight = inputSectionRect.height;
				const paddingNeeded = inputHeight + 20;

				const postsList = this.postsContainer?.querySelector(
					".brainstall-posts-list"
				);
				if (postsList) {
					// スクロール位置を維持しながらpaddingを設定
					const currentScrollTop = (postsList as HTMLElement)
						.scrollTop;
					(postsList as HTMLElement).style.setProperty(
						"padding-bottom",
						`${paddingNeeded}px`,
						"important"
					);
					// スクロール位置を復元
					(postsList as HTMLElement).scrollTop = currentScrollTop;
				}

				// オーバーレイの位置を設定
				if (this.inputOverlay) {
					const inputTop = inputSectionRect.top;
					this.inputOverlay.style.height = `${inputTop}px`;
					this.inputOverlay.style.top = "auto";
					this.inputOverlay.style.bottom = "0px";
				}
			};

			// レイアウトが確定した後に一度だけpaddingを設定
			setTimeout(() => {
				setPadding();
				// スクロール位置を復元
				if (activePostsList) {
					(activePostsList as HTMLElement).scrollTop = savedScrollTop;
				}
			}, 100);

			// テキストエリアにフォーカスを当てる
			const textarea = this.inputContainer.querySelector(
				"textarea"
			) as HTMLTextAreaElement;
			if (textarea) {
				// ボタン状態を更新
				textarea.dispatchEvent(new Event("input", { bubbles: true }));
				// iOSの自動ズームを防ぐため、readonly属性を再設定してからフォーカス
				textarea.setAttribute("readonly", "readonly");
				setTimeout(() => {
					textarea.focus();
					setTimeout(() => {
						textarea.removeAttribute("readonly");
						// スクロール位置を復元
						if (activePostsList) {
							(activePostsList as HTMLElement).scrollTop =
								savedScrollTop;
						}
					}, 100);
				}, 100);
			}
		} else {
			this.inputContainer.removeClass("visible");
			this.inputContainer.addClass("hidden");
			// ランチャーボタンを表示する
			if (this.floatingButton) {
				this.floatingButton.removeClass("hidden");
			}
			// オーバーレイを非表示
			if (this.inputOverlay) {
				this.inputOverlay.addClass("hidden");
				// オーバーレイの位置をリセット
				this.inputOverlay.style.top = "";
				this.inputOverlay.style.bottom = "";
				this.inputOverlay.style.height = "";
			}
			// リサイズハンドラーを削除
			if (this.inputResizeHandler) {
				window.removeEventListener("resize", this.inputResizeHandler);
				this.inputResizeHandler = null;
			}
			// visualViewportのハンドラーを削除
			if (this.inputViewportHandler && window.visualViewport) {
				window.visualViewport.removeEventListener(
					"resize",
					this.inputViewportHandler
				);
				window.visualViewport.removeEventListener(
					"scroll",
					this.inputViewportHandler
				);
				this.inputViewportHandler = null;
			}
			// paddingをCSSのデフォルト値に戻す
			const postsList = this.postsContainer?.querySelector(
				".brainstall-posts-list"
			);
			if (postsList) {
				(postsList as HTMLElement).style.removeProperty(
					"padding-bottom"
				);
			}
		}
	}

	async handleSubmitContent(
		content: string,
		sourceFile: TFile | null = null
	) {
		if (!content.trim()) {
			new Notice("内容を入力してください");
			return;
		}

		await this.plugin.createNewPost(content, sourceFile);
		await this.updatePosts();
		await this.updateGrass();
		await this.updateStats();
		new Notice("通知しました！");
		// 入力欄を閉じる
		this.toggleInputSection();
	}

	// wikilinkを抽出してファイル内容を取得するヘルパー関数
	private async extractWikilinkContents(text: string): Promise<string> {
		const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
		const matches = Array.from(text.matchAll(wikilinkRegex));

		if (matches.length === 0) {
			return "";
		}

		const contents: string[] = [];

		for (const match of matches) {
			const linkText = match[1];
			// パイプ記法（[[表示名|ファイル名]]）の場合はファイル名部分を使用
			const fileName = linkText.split("|").pop() || linkText;

			// ファイルを検索
			const file = this.app.vault
				.getMarkdownFiles()
				.find((f) => f.basename === fileName || f.name === fileName);

			if (file) {
				try {
					const fileContent = await this.app.vault.read(file);
					contents.push(
						`\n\n## [[${fileName}]]の内容\n${fileContent}`
					);
				} catch (error) {
					console.error(`Failed to read file ${fileName}:`, error);
				}
			}
		}

		return contents.join("\n");
	}

	// wikilinkを削除してタイトル用のテキストを作成
	private removeWikilinksForTitle(text: string): string {
		return text.replace(/\[\[([^\]]+)\]\]/g, (match, linkText) => {
			// パイプ記法（[[表示名|ファイル名]]）の場合はファイル名を使用
			// そうでなければファイル名を使用
			const parts = linkText.split("|");
			return parts.length > 1 ? parts[parts.length - 1] : linkText;
		});
	}

	// wikilinkの括弧を完全に削除する（context用）
	private removeWikilinkBrackets(text: string): string {
		return text.replace(/\[\[([^\]]+)\]\]/g, (match, linkText) => {
			// パイプ記法の場合は表示名を使用、そうでなければファイル名を使用
			const parts = linkText.split("|");
			return parts.length > 1 ? parts[0] : linkText;
		});
	}

	// wikilinkを抽出して配列として返す（存在するもののみ）
	private extractWikilinks(text: string): string[] {
		const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
		const matches = Array.from(text.matchAll(wikilinkRegex));
		const validLinks: string[] = [];

		for (const match of matches) {
			const linkText = match[1];
			// パイプ記法の場合はファイル名部分を使用
			const parts = linkText.split("|");
			const fileName =
				parts.length > 1 ? parts[parts.length - 1] : linkText;

			// ファイルが存在するかチェック
			const file = this.app.vault
				.getMarkdownFiles()
				.find((f) => f.basename === fileName || f.name === fileName);

			if (file) {
				validLinks.push(`[[${fileName}]]`);
			}
		}

		return validLinks;
	}

	// contextから使用できない記号を削除
	private sanitizeContext(text: string): string {
		return text
			.replace(/[\/\\?%*:|"<>#\[\]]/g, "")
			.replace(/\n+/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	}

	checkApiKey(): boolean {
		const settings = this.plugin.settings;
		const provider = settings.provider || "openai";

		switch (provider) {
			case "openai":
				if (
					!settings.openaiApiKey ||
					settings.openaiApiKey.trim() === ""
				) {
					new Notice(
						"⚠️ OpenAI APIキーが設定されていません。設定からAPIキーを設定してください。"
					);
					return false;
				}
				break;
			case "claude":
				if (
					!settings.claudeApiKey ||
					settings.claudeApiKey.trim() === ""
				) {
					new Notice(
						"⚠️ Claude APIキーが設定されていません。設定からAPIキーを設定してください。"
					);
					return false;
				}
				break;
			case "groq":
				if (!settings.groqApiKey || settings.groqApiKey.trim() === "") {
					new Notice(
						"⚠️ Groq APIキーが設定されていません。設定からAPIキーを設定してください。"
					);
					return false;
				}
				break;
		}
		return true;
	}

	async handleListifyContent(content: string) {
		const settings = this.plugin.settings;
		const provider = settings.provider || "openai";
		const model = settings.model || "gpt-4o-mini";

		// 選択されたファイルまたは現在開いているファイルのタイトルと本文を取得
		const targetFile =
			this.selectedFile || this.app.workspace.getActiveFile();
		let articleTitle = "";
		let articleContent = "";

		if (targetFile) {
			const fileContent = await this.app.vault.read(targetFile);
			articleContent = fileContent;
			articleTitle = targetFile.basename.replace(/\.md$/, "");
		}

		// content内のwikilinkから追加のコンテンツを取得
		const wikilinkContents = await this.extractWikilinkContents(content);
		if (wikilinkContents) {
			articleContent += wikilinkContents;
		}

		// タイトル用にwikilinkを削除
		const cleanTitle = this.removeWikilinksForTitle(articleTitle);

		// LLM呼び出し
		const result = await this.callLLMForListify(
			content,
			cleanTitle,
			articleContent,
			provider,
			model
		);

		if (result) {
			// 結果を保存（タイトルもクリーンなものを使用）
			await this.saveListifyArticle(content, cleanTitle, result);
		}

		return result;
	}

	async handleDeepDiveContent(content: string) {
		const settings = this.plugin.settings;
		const provider = settings.provider || "openai";
		const model = settings.model || "gpt-4o-mini";

		// 選択されたファイルまたは現在開いているファイルのタイトルと本文を取得
		const targetFile =
			this.selectedFile || this.app.workspace.getActiveFile();
		let articleTitle = "";
		let articleContent = "";

		if (targetFile) {
			const fileContent = await this.app.vault.read(targetFile);
			articleContent = fileContent;

			// ファイル名を取得（.md拡張子を除く）
			articleTitle = targetFile.basename.replace(/\.md$/, "");
		}

		// content内のwikilinkから追加のコンテンツを取得
		const wikilinkContents = await this.extractWikilinkContents(content);
		if (wikilinkContents) {
			articleContent += wikilinkContents;
		}

		// 参照テキストがない場合はエラー
		if (!articleContent || articleContent.trim().length === 0) {
			new Notice(
				"❌ 参照テキストが不足しています。ファイルを開いてから深掘りしてください。"
			);
			return null;
		}

		// タイトル用にwikilinkを削除
		const cleanTitle = this.removeWikilinksForTitle(articleTitle);

		// LLM呼び出し
		const result = await this.callLLMForDeepDive(
			content,
			provider,
			model,
			cleanTitle,
			articleContent
		);

		// タイトルと結果を返す（クリーンなタイトルを使用）
		return { title: cleanTitle, content: result };
	}

	private formatTimestamp(format: string, date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		const seconds = String(date.getSeconds()).padStart(2, "0");

		if (format === "ISO") {
			return date.toISOString().replace(/[:.]/g, "-").slice(0, -5);
		} else if (format === "Unix") {
			return String(Math.floor(date.getTime() / 1000));
		} else {
			// カスタムフォーマット
			return format
				.replace(/YYYY/g, String(year))
				.replace(/MM/g, month)
				.replace(/DD/g, day)
				.replace(/HH/g, hours)
				.replace(/mm/g, minutes)
				.replace(/ss/g, seconds);
		}
	}

	// JST時刻をISO形式で返す関数
	private toJSTISOString(date: Date): string {
		// ローカル時刻を取得してJSTとして扱う
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		const seconds = String(date.getSeconds()).padStart(2, "0");
		const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
		return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}+09:00`;
	}

	// 年/年月/年月日の階層構造でフォルダパスを生成する関数
	private getDateFolderPath(baseFolder: string, date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const yearMonth = `${year}-${month}`;
		const yearMonthDay = `${year}-${month}-${day}`;
		return `${baseFolder}/${year}/${yearMonth}/${yearMonthDay}`;
	}

	// 階層フォルダを確実に作成する関数
	private async ensureFolderExists(folderPath: string) {
		if (!(await this.app.vault.adapter.exists(folderPath))) {
			// 階層的にフォルダを作成
			const parts = folderPath.split("/");
			let currentPath = "";
			for (const part of parts) {
				if (part === "") continue;
				currentPath = currentPath ? `${currentPath}/${part}` : part;
				if (!(await this.app.vault.adapter.exists(currentPath))) {
					await this.app.vault.createFolder(currentPath);
				}
			}
		}
	}

	async saveDeepDiveArticle(
		userPrompt: string,
		sourceTitle: string,
		content: string
	) {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		const hours = String(now.getHours()).padStart(2, "0");
		const minutes = String(now.getMinutes()).padStart(2, "0");
		const seconds = String(now.getSeconds()).padStart(2, "0");

		const timestamp = this.formatTimestamp(
			this.plugin.settings.timestampFormat,
			now
		);

		// ファイル名には一行目のみを使用
		const firstLine = userPrompt.split("\n")[0] || "";
		const cleanFirstLine = this.removeWikilinkBrackets(firstLine);
		// タイトルに使用できない記号やスペースを削除
		const safeContext = cleanFirstLine
			.replace(/[\/\\?%*:|"<>]/g, "_")
			.replace(/\s+/g, "_")
			.trim();
		const fileName = `${timestamp}_deepDive_${safeContext}.md`;
		const baseFolder =
			this.plugin.settings.notificationFolder || "Archives/Notifications";
		const folderPath = this.getDateFolderPath(baseFolder, now);

		// フォルダが存在しない場合は作成
		await this.ensureFolderExists(folderPath);

		// wikilinkを抽出（userPromptとsourceTitleから、存在するもののみ）
		const wikilinks = [
			...this.extractWikilinks(userPrompt),
			...this.extractWikilinks(`[[${sourceTitle}]]`),
		];
		// 重複を除去
		const uniqueWikilinks = Array.from(new Set(wikilinks));

		// 一行目からcontextを作成（記号などを削除）
		const contextLine = this.sanitizeContext(
			this.removeWikilinkBrackets(firstLine)
		);

		// frontmatterを作成
		let frontmatter = `---
type: deepDive`;

		// contextを追加
		if (contextLine) {
			frontmatter += `\ncontext: "${contextLine}"`;
		}

		// linksがある場合は追加（YAML配列形式）
		if (uniqueWikilinks.length > 0) {
			frontmatter += `\nlinks:`;
			for (const link of uniqueWikilinks) {
				frontmatter += `\n  - "${link}"`;
			}
		}

		frontmatter += `\ncreated: "${this.toJSTISOString(now)}"
---

${userPrompt}

---

${content}`;

		const filePath = `${folderPath}/${fileName}`;
		await this.app.vault.create(filePath, frontmatter);

		// 更新は呼び出し側で行う（スケルトン問題のため）
		// await this.updatePosts();
		await this.updateGrass();
		await this.updateStats();
	}

	async saveListifyArticle(
		userPrompt: string,
		sourceTitle: string,
		items: string[]
	) {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		const hours = String(now.getHours()).padStart(2, "0");
		const minutes = String(now.getMinutes()).padStart(2, "0");
		const seconds = String(now.getSeconds()).padStart(2, "0");

		const timestamp = this.formatTimestamp(
			this.plugin.settings.timestampFormat,
			now
		);

		// ファイル名には一行目のみを使用
		const firstLine = userPrompt.split("\n")[0] || "";
		const cleanFirstLine = this.removeWikilinkBrackets(firstLine);
		// タイトルに使用できない記号やスペースを削除
		const safeContext = cleanFirstLine
			.replace(/[\/\\?%*:|"<>]/g, "_")
			.replace(/\s+/g, "_")
			.trim();
		const fileName = `${timestamp}_listify_${safeContext}.md`;
		const baseFolder =
			this.plugin.settings.notificationFolder || "Archives/Notifications";
		const folderPath = this.getDateFolderPath(baseFolder, now);

		// フォルダが存在しない場合は作成
		await this.ensureFolderExists(folderPath);

		// wikilinkを抽出（userPromptとsourceTitleから、存在するもののみ）
		const wikilinks = [
			...this.extractWikilinks(userPrompt),
			...this.extractWikilinks(`[[${sourceTitle}]]`),
		];
		// 重複を除去
		const uniqueWikilinks = Array.from(new Set(wikilinks));

		// 一行目からcontextを作成（記号などを削除）
		const contextLine = this.sanitizeContext(
			this.removeWikilinkBrackets(firstLine)
		);

		// frontmatterを作成
		let frontmatter = `---
type: listify`;

		// contextを追加
		if (contextLine) {
			frontmatter += `\ncontext: "${contextLine}"`;
		}

		// linksがある場合は追加（YAML配列形式）
		if (uniqueWikilinks.length > 0) {
			frontmatter += `\nlinks:`;
			for (const link of uniqueWikilinks) {
				frontmatter += `\n  - "${link}"`;
			}
		}

		frontmatter += `\ncreated: "${this.toJSTISOString(now)}"
---

${userPrompt}

---

`;

		// チェックリストコンテンツを作成
		const listContent = items.map((item) => `- [ ] ${item}`).join("\n");

		const filePath = `${folderPath}/${fileName}`;
		await this.app.vault.create(filePath, frontmatter + listContent);

		// await this.updatePosts();
		await this.updateGrass();
		await this.updateStats();
	}

	async callLLMForListify(
		content: string,
		articleTitle: string,
		articleContent: string,
		provider: string,
		model: string
	): Promise<string[] | null> {
		const settings = this.plugin.settings;

		try {
			const prompt = `以下の記事「${articleTitle}」の内容を参照して、「${content}」に関するチェックリストを作成してください。

# 記事内容
${articleContent}

# 要求事項
上記の記事内容をもとに、「${content}」という文脈に関連する行動チェックリストを作成してください。  
目的は、その文脈で実践・検討・改善すべきアクションを抽出することです。

## 作成ルール
1. 各項目は自然な日本語の一文で書くこと。  
2. 各文は「〜して〇〇する」「〜のために〇〇する」のように、行動と意図を含めること。  
3. 各項目は50文字前後を目安とする。  
4. 出力はチェックリスト形式（- [ ]）のみとし、他の説明や見出しは不要。  
5. 記号「：」や括弧を使わず、自然な文章で目的を表現する。

# 出力フォーマット例
- [ ] 週に一度データをバックアップして損失に備える  
- [ ] チームで進捗を共有して認識をそろえる  
- [ ] 実験手順を整理して再現性を高める`;

			let response = "";

			if (provider === "openai" && settings.openaiApiKey) {
				response = await this.callOpenAI(
					prompt,
					settings.openaiApiKey,
					model
				);
			} else if (provider === "claude" && settings.claudeApiKey) {
				response = await this.callClaude(
					prompt,
					settings.claudeApiKey,
					model
				);
			} else if (provider === "groq" && settings.groqApiKey) {
				response = await this.callGroq(
					prompt,
					settings.groqApiKey,
					model
				);
			} else {
				new Notice(
					"❌ API Keyが設定されていません。設定画面でAPI Keyを入力してください。"
				);
				return null;
			}

			// レスポンスをパース（チェックリスト形式）
			const lines = response
				.split("\n")
				.filter((line) => line.trim().startsWith("- [ ]"))
				.map((line) => line.replace(/^-\s*\[\s*\]\s*/, "").trim());

			return lines;
		} catch (error) {
			console.error("Listify Error:", error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			new Notice(`❌ エラー: ${errorMessage}`);
			return null;
		}
	}

	async callLLMForDeepDive(
		content: string,
		provider: string,
		model: string,
		articleTitle: string,
		articleContent: string
	) {
		const settings = this.plugin.settings;

		try {
			const prompt = `${content}という文脈で以下の参照テキストを分かりやすくまとめてください。

【重要な指示】
1. 参照テキストは音声入力の文字起こしである可能性があり、語尾の不自然さや途中で止まった表現、適当な句読点などが含まれています
2. 元の文章をそのまま引用せず、内容を理解した上で書き言葉として自然で読みやすい文章に修正・整理してください
3. 元のテキストに記載されていない情報や式、数式を追加しないでください
4. 文脈外の記号、会話、関係のないメタデータは記載しないでください
5. h1タグやタイトルは記載せず、h2タグのサブタイトルから設定してください
6. 情報をグループ化し、要点を明確にしてください
7. 曖昧な情報や不明な点がある場合は、「詳細は不明」「記載なし」と明記してください
8. 話し言葉の特徴（「えー」「あの」など）は除去し、書き言葉として適切な表現にしてください

出力はマークダウン形式で、読みやすく整理された要約として記述してください。

---
【参照テキスト】
${articleContent}
---`;

			let response = "";

			if (provider === "openai" && settings.openaiApiKey) {
				response = await this.callOpenAI(
					prompt,
					settings.openaiApiKey,
					model
				);
			} else if (provider === "claude" && settings.claudeApiKey) {
				response = await this.callClaude(
					prompt,
					settings.claudeApiKey,
					model
				);
			} else if (provider === "groq" && settings.groqApiKey) {
				response = await this.callGroq(
					prompt,
					settings.groqApiKey,
					model
				);
			} else {
				new Notice(
					"❌ API Keyが設定されていません。設定画面でAPI Keyを入力してください。"
				);
				return null;
			}

			return response;
		} catch (error) {
			console.error("DeepDive Error:", error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			new Notice(`❌ エラー: ${errorMessage}`);
			return null;
		}
	}

	async callOpenAI(
		prompt: string,
		apiKey: string,
		model: string
	): Promise<string> {
		const response = await fetch(
			"https://api.openai.com/v1/chat/completions",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: model || "gpt-4o-mini",
					messages: [{ role: "user", content: prompt }],
				}),
			}
		);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(
				`OpenAI API error: ${response.status} - ${
					errorData.error?.message || response.statusText
				}`
			);
		}

		const data = await response.json();
		return data.choices[0].message.content;
	}

	async callClaude(
		prompt: string,
		apiKey: string,
		model: string
	): Promise<string> {
		const response = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model: model || "claude-3-5-sonnet-20241022",
				max_tokens: 1024,
				messages: [{ role: "user", content: prompt }],
			}),
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(
				`Claude API error: ${response.status} - ${
					errorData.error?.message || response.statusText
				}`
			);
		}

		const data = await response.json();
		return data.content[0].text;
	}

	async callGroq(
		prompt: string,
		apiKey: string,
		model: string
	): Promise<string> {
		const response = await fetch(
			"https://api.groq.com/openai/v1/chat/completions",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: model || "llama-3.1-70b-versatile",
					messages: [{ role: "user", content: prompt }],
				}),
			}
		);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(
				`Groq API error: ${response.status} - ${
					errorData.error?.message || response.statusText
				}`
			);
		}

		const data = await response.json();
		return data.choices[0].message.content;
	}

	getFrontmatter(content: string): any {
		const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!fmMatch) return null;

		const fmContent = fmMatch[1];
		const frontmatter: any = {};

		fmContent.split("\n").forEach((line) => {
			const match = line.match(/^(\w+):\s*(.+)$/);
			if (match) {
				const key = match[1];
				let value = match[2];

				// クォートを削除
				if (
					(value.startsWith('"') && value.endsWith('"')) ||
					(value.startsWith("'") && value.endsWith("'"))
				) {
					value = value.slice(1, -1);
				}

				frontmatter[key] = value;
			}
		});

		return frontmatter;
	}

	switchTab(tabName: string) {
		const tabs = this.containerEl.querySelectorAll(".brainstall-tab");
		const contents = this.contentContainer.children;

		tabs.forEach((tab) => {
			if (tab.getAttribute("data-tab") === tabName) {
				tab.addClass("active");
			} else {
				tab.removeClass("active");
			}
		});

		Array.from(contents).forEach((content) => {
			if (content.hasClass("active")) {
				content.removeClass("active");
				content.addClass("hidden");
			}
		});

		if (tabName === "posts") {
			this.postsContainer.removeClass("hidden");
			this.postsContainer.addClass("active");
		} else if (tabName === "stats") {
			this.statsContainer.removeClass("hidden");
			this.statsContainer.addClass("active");
			this.updateStats();
			this.updateGrass();
		} else if (tabName === "reference") {
			this.referenceContainer.removeClass("hidden");
			this.referenceContainer.addClass("active");
			this.updateReference();
		}
	}

	async openEditorFromContent(
		content: string,
		sourceFile: TFile | null = null
	) {
		// タイムスタンプで実際のファイルを作成
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		const hours = String(now.getHours()).padStart(2, "0");
		const minutes = String(now.getMinutes()).padStart(2, "0");
		const seconds = String(now.getSeconds()).padStart(2, "0");

		const timestamp = this.formatTimestamp(
			this.plugin.settings.timestampFormat,
			now
		);
		// contextを最初の行から抽出（50文字以内）
		const firstLine = content.split("\n")[0] || content.slice(0, 30);
		const safeContext = firstLine
			.slice(0, 50)
			.replace(/[\/\\?%*:|"<>]/g, "_");
		const fileName = `${timestamp}_article_${safeContext}.md`;

		const baseFolder =
			this.plugin.settings.notificationFolder || "Archives/Notifications";
		const folderPath = this.getDateFolderPath(baseFolder, now);

		// フォルダが存在しない場合は作成
		await this.ensureFolderExists(folderPath);

		// frontmatterを追加
		let frontmatter = `---
type: article
context: "${content}"
created: "${this.toJSTISOString(now)}"`;

		// sourceがある場合は追加（wikilink形式）
		if (sourceFile) {
			frontmatter += `\nsource: "[[${sourceFile.basename}]]"`;
		}

		frontmatter += `\n---

${content}`;

		const filePath = `${folderPath}/${fileName}`;
		const newFile = await this.app.vault.create(filePath, frontmatter);

		const leaf = this.app.workspace.getLeaf(true);
		await leaf.openFile(newFile);

		// 編集モードで開く
		await new Promise((resolve) => setTimeout(resolve, 100));
		await leaf.setViewState({
			type: "markdown",
			state: {
				file: newFile.path,
				mode: "source",
			},
		});

		new Notice("通知ファイルを作成しました。");

		// 一覧を更新
		await this.updatePosts();
		await this.updateGrass();
		await this.updateStats();
	}

	// すべてのハッシュタグを取得
	private async extractHashtags(files: TFile[]): Promise<string[]> {
		const hashtags = new Set<string>();
		for (const file of files) {
			try {
				const content = await this.app.vault.read(file);
				// #で始まるハッシュタグを抽出
				const matches = content.matchAll(
					/#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g
				);
				for (const match of matches) {
					hashtags.add(match[0].toLowerCase());
				}
			} catch (e) {
				// エラーは無視
			}
		}
		return Array.from(hashtags).sort();
	}

	async updatePosts() {
		// スクロール位置を保存（updatePostsが呼ばれる前に）
		const activePostsList = this.postsContainer?.querySelector(
			".brainstall-posts-list"
		);
		const savedScrollTop = activePostsList
			? (activePostsList as HTMLElement).scrollTop
			: 0;

		// 全ての通知を取得して表示
		const baseFolder =
			this.plugin.settings.notificationFolder || "Archives/Notifications";
		const allFiles = this.app.vault
			.getFiles()
			.filter((f) => f.path.startsWith(baseFolder + "/"));

		// frontmatterのcreatedでソート（新しい順）、ピン状態も確認
		const filesWithDates = await Promise.all(
			allFiles.map(async (file) => {
				let date = new Date(0);
				let isPinned = false;
				try {
					const content = await this.app.vault.read(file);
					const frontmatter = this.getFrontmatter(content);
					if (frontmatter?.created) {
						date = new Date(frontmatter.created);
					} else {
						// フォールバック: ファイル名から抽出
						const match = file.path.match(/(\d{8})_(\d{6})/);
						if (match) {
							const dateStr = match[1];
							const timeStr = match[2];
							date = new Date(
								parseInt(dateStr.substring(0, 4)),
								parseInt(dateStr.substring(4, 6)) - 1,
								parseInt(dateStr.substring(6, 8)),
								parseInt(timeStr.substring(0, 2)),
								parseInt(timeStr.substring(2, 4)),
								parseInt(timeStr.substring(4, 6))
							);
						} else {
							// フォールバック: mtime
							date = new Date(file.stat.mtime);
						}
					}
					isPinned = content.includes("pinned: true");
				} catch (e) {
					// エラーの場合はmtimeを使用
					date = new Date(file.stat.mtime);
				}
				return { file, date, isPinned };
			})
		);

		// ピンされた通知を最初に、その後に通常の通知（両方とも日付順）
		const files = filesWithDates
			.sort((a, b) => {
				// ピンされた通知を優先
				if (a.isPinned && !b.isPinned) return -1;
				if (!a.isPinned && b.isPinned) return 1;
				// 同じピン状態の場合は日付順（新しい順）
				return b.date.getTime() - a.date.getTime();
			})
			.map((item) => item.file);

		// すべてのハッシュタグを取得
		const allHashtags = await this.extractHashtags(files);

		// すべての日付を取得
		const allDates = new Set<string>();
		filesWithDates.forEach((item) => {
			const dateStr = item.date.toISOString().slice(0, 10); // YYYY-MM-DD
			allDates.add(dateStr);
		});
		const sortedDates = Array.from(allDates).sort().reverse();

		this.postsContainer.empty();

		if (files.length === 0) {
			this.postsContainer.createEl("p", {
				text: "まだ通知がありません",
				cls: "brainstall-empty",
			});
			return;
		}

		// ヘッダー部分
		const headerEl = this.postsContainer.createEl("div", {
			cls: "brainstall-posts-header",
		});

		// 表示される件数を先にカウント
		let visibleCount = 0;
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const content = await this.app.vault.read(file);
			const isArchived =
				content.includes("archived: true") ||
				content.includes("status: archived");

			// アーカイブフィルター
			if (!this.showArchived && isArchived) {
				continue;
			}

			// 検索キーワードフィルター（#で始まるハッシュタグとして扱う）
			if (this.searchKeyword && this.searchKeyword.startsWith("#")) {
				const hashtag = this.searchKeyword.toLowerCase();
				if (!content.toLowerCase().includes(hashtag)) {
					continue;
				}
			}

			// 日付フィルター
			if (this.searchDate) {
				const fileWithDate = filesWithDates.find(
					(item) => item.file.path === file.path
				);
				if (fileWithDate) {
					const fileDate = fileWithDate.date
						.toISOString()
						.slice(0, 10);
					if (fileDate !== this.searchDate) {
						continue;
					}
				}
			}

			// タイプフィルター
			if (this.searchType) {
				if (!content.includes(`type: ${this.searchType}`)) {
					continue;
				}
			}

			visibleCount++;
		}

		// 見出し行
		const titleRow = headerEl.createEl("div", {
			cls: "brainstall-header-title-row",
		});
		titleRow.createEl("h3", { text: `全ての通知 (${visibleCount}件)` });

		// 更新ボタンを「全ての通知」の横に配置
		const refreshBtn = titleRow.createEl("button", {
			text: "🔄",
			cls: "brainstall-refresh-btn",
			attr: { title: "更新" },
		});
		refreshBtn.addEventListener("click", async () => {
			await this.updatePosts();
			await this.updateGrass();
			await this.updateStats();
			new Notice("更新しました");
		});

		// フィルタ行
		const filterRow = headerEl.createEl("div", {
			cls: "brainstall-header-filter-row",
		});

		// ハッシュタグ選択ドロップダウン
		const hashtagSelect = filterRow.createEl("select", {
			cls: "brainstall-hashtag-select",
		}) as HTMLSelectElement;

		// すべて選択オプション
		hashtagSelect.createEl("option", {
			text: "🔍 ハッシュタグ",
			value: "",
		});

		// ハッシュタグオプションを追加
		allHashtags.forEach((hashtag) => {
			const option = hashtagSelect.createEl("option", {
				text: hashtag,
				value: hashtag,
			});
		});

		// 現在選択中のハッシュタグを設定
		if (this.searchKeyword) {
			hashtagSelect.value = this.searchKeyword;
		}

		hashtagSelect.addEventListener("change", (e) => {
			const select = e.target as HTMLSelectElement;
			this.searchKeyword = select.value;
			this.updatePosts();
		});

		// 日付選択ドロップダウン
		const dateSelect = filterRow.createEl("select", {
			cls: "brainstall-date-select",
		}) as HTMLSelectElement;

		// すべて選択オプション
		dateSelect.createEl("option", {
			text: "📅 日付",
			value: "",
		});

		// 日付オプションを追加
		sortedDates.forEach((dateStr) => {
			const date = new Date(dateStr);
			const formattedDate = date.toLocaleDateString("ja-JP", {
				year: "numeric",
				month: "short",
				day: "numeric",
			});
			dateSelect.createEl("option", {
				text: formattedDate,
				value: dateStr,
			});
		});

		// 現在選択中の日付を設定
		if (this.searchDate) {
			dateSelect.value = this.searchDate;
		}

		dateSelect.addEventListener("change", (e) => {
			const select = e.target as HTMLSelectElement;
			this.searchDate = select.value;
			this.updatePosts();
		});

		// タイプ選択ドロップダウン
		const typeSelect = filterRow.createEl("select", {
			cls: "brainstall-type-select",
		}) as HTMLSelectElement;

		// すべて選択オプション
		typeSelect.createEl("option", {
			text: "タイプ",
			value: "",
		});

		// タイプオプションを追加
		const types = [
			"memo",
			"listify",
			"text",
			"audio",
			"images",
			"deepDive",
		];
		types.forEach((type) => {
			const typeNames: Record<string, string> = {
				memo: "📝 メモ",
				listify: "📋 リスト",
				text: "⌨️ キーボード入力",
				audio: "🎤 ボイスメモ",
				images: "📷 連続撮影",
				deepDive: "🔍 深掘り",
			};
			typeSelect.createEl("option", {
				text: typeNames[type] || type,
				value: type,
			});
		});

		// 現在選択中のタイプを設定
		if (this.searchType) {
			typeSelect.value = this.searchType;
		}

		typeSelect.addEventListener("change", (e) => {
			const select = e.target as HTMLSelectElement;
			this.searchType = select.value;
			this.updatePosts();
		});

		// 星の数フィルタ（複数選択可能なドロップダウン）
		const prioritySelectWrapper = filterRow.createEl("div", {
			cls: "brainstall-priority-select-wrapper",
		});
		prioritySelectWrapper.style.position = "relative";
		prioritySelectWrapper.style.flex = "1";
		prioritySelectWrapper.style.minWidth = "120px";
		prioritySelectWrapper.style.maxWidth = "400px";

		// 表示用のプレースホルダー
		const displayText = prioritySelectWrapper.createEl("div", {
			cls: "brainstall-priority-select-display",
		});
		displayText.style.padding = "4px 8px";
		displayText.style.border =
			"1px solid var(--background-modifier-border)";
		displayText.style.borderRadius = "4px";
		displayText.style.background = "var(--background-primary)";
		displayText.style.color = "var(--text-normal)";
		displayText.style.fontSize = "13px";
		displayText.style.cursor = "pointer";
		displayText.style.display = "flex";
		displayText.style.alignItems = "center";
		displayText.style.justifyContent = "space-between";

		const displayLabel = displayText.createEl("span", {
			text:
				this.selectedPriorities.length > 0
					? `⭐ ${this.selectedPriorities
							.sort((a, b) => a - b)
							.join(", ")}`
					: "⭐ 星の数",
		});

		const displayArrow = displayText.createEl("span", {
			text: "▼",
			cls: "brainstall-priority-select-arrow",
		});
		displayArrow.style.fontSize = "10px";
		displayArrow.style.color = "var(--text-muted)";
		displayArrow.style.marginLeft = "8px";

		// ドロップダウンリスト（非表示）
		const dropdownList = prioritySelectWrapper.createEl("div", {
			cls: "brainstall-priority-dropdown-list",
		});
		dropdownList.style.display = "none";
		dropdownList.style.position = "absolute";
		dropdownList.style.top = "100%";
		dropdownList.style.left = "0";
		dropdownList.style.right = "0";
		dropdownList.style.background = "var(--background-primary)";
		dropdownList.style.border =
			"1px solid var(--background-modifier-border)";
		dropdownList.style.borderRadius = "4px";
		dropdownList.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
		dropdownList.style.marginTop = "4px";
		dropdownList.style.maxHeight = "200px";
		dropdownList.style.overflowY = "auto";
		dropdownList.style.zIndex = "1000";

		// ドロップダウンリスト内のクリックで閉じないようにする（capture phaseで阻止）
		dropdownList.addEventListener(
			"click",
			(e) => {
				e.stopPropagation();
				e.stopImmediatePropagation();
			},
			true
		);
		dropdownList.addEventListener(
			"mousedown",
			(e) => {
				e.stopPropagation();
				e.stopImmediatePropagation();
			},
			true
		);

		// 0〜5の星をチェックボックス付きオプションとして追加
		for (let i = 0; i <= 5; i++) {
			const optionItem = dropdownList.createEl("label", {
				cls: "brainstall-priority-option-item",
			});
			optionItem.style.display = "flex";
			optionItem.style.alignItems = "center";
			optionItem.style.padding = "4px 8px";
			optionItem.style.cursor = "pointer";
			optionItem.style.borderBottom =
				"1px solid var(--background-modifier-border)";
			optionItem.style.fontSize = "12px";

			optionItem.addEventListener("mouseenter", () => {
				optionItem.style.background =
					"var(--background-modifier-hover)";
			});
			optionItem.addEventListener("mouseleave", () => {
				optionItem.style.background = "transparent";
			});

			const checkbox = optionItem.createEl("input", {
				type: "checkbox",
				cls: "brainstall-priority-option-checkbox",
			}) as HTMLInputElement;
			checkbox.value = i.toString();
			checkbox.checked = this.selectedPriorities.includes(i);
			checkbox.style.marginRight = "6px";
			checkbox.style.width = "14px";
			checkbox.style.height = "14px";
			checkbox.style.cursor = "pointer";

			const labelText = optionItem.createEl("span", {
				text: "⭐".repeat(i) + (i === 0 ? "なし" : ""),
			});
			labelText.style.fontSize = "11px";
			labelText.style.lineHeight = "1.2";
			// 星アイコンを小さくする
			if (i > 0) {
				labelText.style.display = "inline-block";
				labelText.style.transform = "scale(0.85)";
				labelText.style.transformOrigin = "left center";
			}

			// チェックボックスのクリックイベントで伝播を停止（capture phaseで阻止）
			checkbox.addEventListener(
				"click",
				(e) => {
					e.stopPropagation();
					e.stopImmediatePropagation();
				},
				true
			);
			checkbox.addEventListener(
				"mousedown",
				(e) => {
					e.stopPropagation();
					e.stopImmediatePropagation();
				},
				true
			);

			checkbox.addEventListener("change", (e) => {
				e.stopPropagation();
				if (checkbox.checked) {
					if (!this.selectedPriorities.includes(i)) {
						this.selectedPriorities.push(i);
					}
				} else {
					this.selectedPriorities = this.selectedPriorities.filter(
						(p) => p !== i
					);
				}
				// 表示テキストを更新
				displayLabel.textContent =
					this.selectedPriorities.length > 0
						? `⭐ ${this.selectedPriorities
								.sort((a, b) => a - b)
								.join(", ")}`
						: "⭐ 星の数";
				this.updatePosts();
			});

			// optionItemのクリックでも伝播を停止（capture phaseで阻止）
			optionItem.addEventListener(
				"click",
				(e) => {
					e.stopPropagation();
					e.stopImmediatePropagation();
				},
				true
			);
			optionItem.addEventListener(
				"mousedown",
				(e) => {
					e.stopPropagation();
					e.stopImmediatePropagation();
				},
				true
			);
		}

		// ドロップダウンを開く/閉じる
		let isOpen = false;
		let closeHandler: ((e: MouseEvent) => void) | null = null;

		displayText.addEventListener("click", (e) => {
			e.stopPropagation();
			isOpen = !isOpen;
			dropdownList.style.display = isOpen ? "block" : "none";
			if (isOpen) {
				displayArrow.textContent = "▲";
				// 既存のハンドラーを削除してから新しいものを追加
				if (closeHandler) {
					document.removeEventListener("mousedown", closeHandler);
				}
				// 外側をクリックしたら閉じる（mousedownイベントを使用）
				closeHandler = (e: MouseEvent) => {
					// prioritySelectWrapperに含まれていない場合のみ閉じる
					const target = e.target as Node;
					if (target && !prioritySelectWrapper.contains(target)) {
						isOpen = false;
						dropdownList.style.display = "none";
						displayArrow.textContent = "▼";
						if (closeHandler) {
							document.removeEventListener(
								"mousedown",
								closeHandler
							);
							closeHandler = null;
						}
					}
				};
				setTimeout(() => {
					document.addEventListener("mousedown", closeHandler!, true); // capture phaseで監視
				}, 0);
			} else {
				displayArrow.textContent = "▼";
				if (closeHandler) {
					document.removeEventListener("mousedown", closeHandler);
					closeHandler = null;
				}
			}
		});

		// ハッシュタグ解除ボタン（キーワードが選択されている場合のみ表示）
		if (this.searchKeyword) {
			const clearBtn = filterRow.createEl("button", {
				text: "✕ 解除",
				cls: "brainstall-clear-btn",
				attr: { title: "フィルターを解除" },
			});
			clearBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.searchKeyword = "";
				this.updatePosts();
			});
		}

		// フィルタボタン
		const filterBtn = filterRow.createEl("button", {
			text: this.showArchived ? "すべて" : "アクティブ",
			cls: "brainstall-filter-btn",
		});
		filterBtn.addEventListener("click", () => {
			this.showArchived = !this.showArchived;
			this.updatePosts();
			this.updateStats();
		});

		// スクロール可能なコンテナ
		const postsList = this.postsContainer.createEl("div", {
			cls: "brainstall-posts-list",
		});

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			// 内容をプレビュー表示
			const content = await this.app.vault.read(file);

			// frontmatterを取得
			const frontmatter = this.getFrontmatter(content);

			// frontmatterを確認
			const isArchived =
				content.includes("archived: true") ||
				content.includes("status: archived");
			const isPinned = content.includes("pinned: true");

			const isDeepDive = content.includes("type: deepDive");
			const isListify = content.includes("type: listify");

			// contextを取得（すべてのtypeで取得）
			let context = "";
			const hasContext = content.includes("context:");
			const contextMatch = content.match(/context:\s*"([^"]*)"/);
			if (contextMatch) {
				context = contextMatch[1];
			}

			// フィルタリング
			if (!this.showArchived && isArchived) {
				continue;
			}

			// 検索キーワードフィルター（#で始まるハッシュタグとして扱う）
			if (this.searchKeyword && this.searchKeyword.startsWith("#")) {
				const hashtag = this.searchKeyword.toLowerCase();
				if (!content.toLowerCase().includes(hashtag)) {
					continue;
				}
			}

			// 日付フィルター
			if (this.searchDate) {
				const fileWithDate = filesWithDates.find(
					(item) => item.file.path === file.path
				);
				if (fileWithDate) {
					const fileDate = fileWithDate.date
						.toISOString()
						.slice(0, 10);
					if (fileDate !== this.searchDate) {
						continue;
					}
				}
			}

			// タイプフィルター
			if (this.searchType) {
				if (!content.includes(`type: ${this.searchType}`)) {
					continue;
				}
			}

			// 星の数フィルター（複数選択対応）
			// 何も選択されていない場合は全て表示
			if (this.selectedPriorities.length > 0) {
				const priority = frontmatter?.priority
					? Number(frontmatter.priority)
					: 0;
				if (!this.selectedPriorities.includes(priority)) {
					continue;
				}
			}

			const postEl = postsList.createEl("div", {
				cls: "brainstall-post",
			});

			// タイムスタンプ
			let date: Date | null = null;

			// frontmatterのcreatedを優先的に使用
			if (frontmatter?.created) {
				date = new Date(frontmatter.created);
			} else {
				// フォールバック: ファイル名から抽出
				const match = file.path.match(/(\d{8})_(\d{6})/);
				if (match) {
					const dateStr = match[1];
					const timeStr = match[2];
					date = new Date(
						parseInt(dateStr.substring(0, 4)),
						parseInt(dateStr.substring(4, 6)) - 1,
						parseInt(dateStr.substring(6, 8)),
						parseInt(timeStr.substring(0, 2)),
						parseInt(timeStr.substring(2, 4)),
						parseInt(timeStr.substring(4, 6))
					);
				}
			}

			// 日付と優先度のコンテナ
			const datePriorityContainer = postEl.createEl("div", {
				cls: "brainstall-date-priority-container",
			});

			if (date) {
				datePriorityContainer.createEl("div", {
					text: date.toLocaleString("ja-JP", {
						month: "short",
						day: "numeric",
						hour: "2-digit",
						minute: "2-digit",
						second: "2-digit",
					}),
					cls: "brainstall-post-date",
				});
			}

			// 優先度の星評価を表示
			const priority = frontmatter?.priority
				? Number(frontmatter.priority)
				: 0;
			const priorityContainer = datePriorityContainer.createEl("div", {
				cls: "brainstall-priority-stars",
			});

			for (let i = 1; i <= 5; i++) {
				const isFilled = i <= priority;
				const star = priorityContainer.createEl("span", {
					text: isFilled ? "⭐️" : "☆",
					cls: `brainstall-priority-star ${
						isFilled ? "filled" : "blank"
					}`,
				});
				star.setAttribute("data-priority", i.toString());
				star.addEventListener("click", async (e) => {
					e.stopPropagation();
					// 現在の優先度より小さい星をクリック → その数値に設定
					// 現在の優先度と一致する星をクリック → その数値-1に設定（最小0）
					// 現在の優先度より大きい星（空白）をクリック → その数値に設定
					const currentPriority = frontmatter?.priority
						? Number(frontmatter.priority)
						: 0;
					const newPriority =
						i < currentPriority
							? i
							: i === currentPriority
							? Math.max(0, i - 1)
							: i;
					await this.setPriority(file, newPriority);
				});
			}

			if (isArchived) {
				postEl.addClass("archived");
			}
			if (isPinned) {
				postEl.addClass("pinned");
			}

			const contentDiv = postEl.createEl("div", {
				cls: "brainstall-post-content",
			});

			// 全ての通知タイプで本文の最初の3行を表示
			// frontmatterを削除
			let cleanContent = content.replace(/^---[\s\S]*?---\n?/, "").trim();

			// 最初の3行を取得
			const lines = cleanContent
				.split("\n")
				.slice(0, 3)
				.join("\n")
				.trim();

			// Markdownをプレビュー表示
			if (lines) {
				MarkdownRenderer.renderMarkdown(
					lines,
					contentDiv,
					file.path,
					this
				);

				// ハッシュタグがクリックされたときにフィルタリング
				contentDiv.addEventListener("click", (e) => {
					const target = e.target as HTMLElement;

					// リンクがクリック可能になるように処理
					const link = target.closest("a");
					if (link) {
						e.preventDefault();
						e.stopPropagation();
						const href = link.getAttribute("href");
						const linkText = link.textContent || "";

						// ハッシュタグの場合（リンクのテキストが#で始まる）
						if (linkText.startsWith("#")) {
							const hashtag = linkText.toLowerCase();
							this.searchKeyword = hashtag;
							this.updatePosts();
							return;
						}

						console.log("Link clicked:", href);
						if (href) {
							// 内部リンク（wikilink）
							if (href.startsWith("#search")) {
								const linkText = href.substring(1);
								this.app.workspace.openLinkText(
									linkText,
									file.path,
									false
								);
							}
							// 外部リンク
							else if (
								href.startsWith("http://") ||
								href.startsWith("https://")
							) {
								window.open(href, "_blank");
							}
							// Obsidianの内部リンク（data-href属性）
							else {
								const dataHref = link.getAttribute("data-href");
								if (dataHref) {
									this.app.workspace.openLinkText(
										dataHref,
										file.path,
										false
									);
								}
							}
						}
					}
				});
			} else {
				contentDiv.textContent = "(空)";
			}

			// アクションボタン
			const actionBar = postEl.createEl("div", {
				cls: "brainstall-post-actions",
			});

			// 右側のボタンコンテナ
			const rightActions = actionBar.createEl("div", {
				cls: "brainstall-right-actions",
			});

			// ピンボタン
			const pinBtn = rightActions.createEl("button", {
				text: isPinned ? "📌" : "📍",
				attr: { title: isPinned ? "ピン留めを解除" : "ピン留め" },
			});
			pinBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				await this.togglePin(file);
			});

			// Shareボタン
			const shareBtn = rightActions.createEl("button", { text: "🔗" });
			shareBtn.setAttribute("title", "共有");
			shareBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				await this.sharePost(file);
			});

			// 下部のアクションボタンコンテナ（削除、アーカイブ、Topicsへ移行）
			const bottomActions = postEl.createEl("div", {
				cls: "brainstall-bottom-actions",
			});

			// 左：削除ボタン
			const deleteBtn = bottomActions.createEl("button", {
				text: "🗑️ 削除",
				cls: "brainstall-bottom-action-btn",
			});
			deleteBtn.style.position = "relative";
			deleteBtn.style.overflow = "hidden";

			// プログレスバー
			const deleteProgress = deleteBtn.createEl("div", {
				cls: "brainstall-progress-bar",
			});
			deleteProgress.style.position = "absolute";
			deleteProgress.style.left = "0";
			deleteProgress.style.top = "0";
			deleteProgress.style.height = "100%";
			deleteProgress.style.width = "0%";
			deleteProgress.style.background = "var(--interactive-accent)";
			deleteProgress.style.opacity = "0.3";
			deleteProgress.style.transition = "width 0.1s linear";
			deleteProgress.style.zIndex = "0";
			deleteProgress.style.pointerEvents = "none";

			// ボタンテキストを前面に
			deleteBtn.style.zIndex = "1";
			deleteBtn.style.position = "relative";

			// 長押し検出用
			let deleteLongPressTimer: number | null = null;
			let deleteExecuted = false; // 長押しで実行済みフラグ
			let deleteProgressInterval: number | null = null;
			let deleteWasLongPress = false; // 長押しを開始したかどうか
			let deleteExecutionTimer: number | null = null; // 50ms待機中のタイマー
			let deleteCancelled = false; // 50ms待機中にキャンセルされたかどうか

			deleteBtn.addEventListener("mousedown", () => {
				deleteExecuted = false;
				deleteWasLongPress = true; // 長押し開始
				deleteCancelled = false; // リセット
				deleteProgress.style.width = "0%";
				// 既存の実行待機タイマーがあればキャンセル
				if (deleteExecutionTimer) {
					clearTimeout(deleteExecutionTimer);
					deleteExecutionTimer = null;
				}

				// プログレスバーアニメーション
				let startTime = Date.now();
				deleteProgressInterval = window.setInterval(() => {
					const elapsed = Date.now() - startTime;
					const progress = Math.min((elapsed / 1000) * 100, 100);
					deleteProgress.style.width = `${progress}%`;
				}, 10);

				deleteLongPressTimer = window.setTimeout(async () => {
					// 1000ms長押し完了
					deleteLongPressTimer = null;
					if (deleteProgressInterval) {
						clearInterval(deleteProgressInterval);
						deleteProgressInterval = null;
					}
					deleteProgress.style.width = "100%";
					// プログレスバーが100%に達してから実行（視覚的なマージン）
					// この50ms待機中もキャンセル可能にする
					deleteCancelled = false; // リセット
					deleteExecutionTimer = window.setTimeout(async () => {
						deleteExecutionTimer = null;
						// 50ms待機中にキャンセルされていない場合のみ実行
						if (deleteCancelled || deleteExecuted) {
							// キャンセルされたか、既に実行済み
							deleteProgress.style.width = "0%";
							return;
						}
						deleteExecuted = true;
						deleteWasLongPress = false;
						await this.deletePost(file);
						deleteProgress.style.width = "0%";
					}, 50);
				}, 1000);
			});

			deleteBtn.addEventListener("mouseup", () => {
				// 長押しを途中で辞めた場合、通常のクリックとして実行しない
				if (deleteLongPressTimer) {
					deleteWasLongPress = true; // 長押しを途中で辞めた
					clearTimeout(deleteLongPressTimer);
					deleteLongPressTimer = null;
				}
				// 50ms待機中の実行もキャンセル
				if (deleteExecutionTimer) {
					deleteCancelled = true; // キャンセル
					clearTimeout(deleteExecutionTimer);
					deleteExecutionTimer = null;
				}
				if (deleteProgressInterval) {
					clearInterval(deleteProgressInterval);
					deleteProgressInterval = null;
				}
				deleteProgress.style.width = "0%";
			});

			deleteBtn.addEventListener("mouseleave", () => {
				// 長押しを途中で辞めた場合、通常のクリックとして実行しない
				if (deleteLongPressTimer) {
					deleteWasLongPress = true; // 長押しを途中で辞めた
					clearTimeout(deleteLongPressTimer);
					deleteLongPressTimer = null;
				}
				// 50ms待機中の実行もキャンセル
				if (deleteExecutionTimer) {
					deleteCancelled = true; // キャンセル
					clearTimeout(deleteExecutionTimer);
					deleteExecutionTimer = null;
				}
				if (deleteProgressInterval) {
					clearInterval(deleteProgressInterval);
					deleteProgressInterval = null;
				}
				deleteProgress.style.width = "0%";
			});

			deleteBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				// 長押しで既に実行済みの場合は何もしない
				if (deleteExecuted) {
					deleteExecuted = false;
					deleteWasLongPress = false;
					return;
				}
				// 長押しを途中で辞めた場合は何もしない（キャンセル）
				if (deleteWasLongPress) {
					deleteWasLongPress = false;
					return;
				}
				// 通常のクリックは確認なしで実行
				await this.deletePost(file);
			});

			// 中央：アーカイブボタン
			if (isArchived) {
				const unarchiveBtn = bottomActions.createEl("button", {
					text: "📁 復元",
					cls: "brainstall-bottom-action-btn",
				});
				unarchiveBtn.style.position = "relative";
				unarchiveBtn.style.overflow = "hidden";

				// プログレスバー
				const unarchiveProgress = unarchiveBtn.createEl("div", {
					cls: "brainstall-progress-bar",
				});
				unarchiveProgress.style.position = "absolute";
				unarchiveProgress.style.left = "0";
				unarchiveProgress.style.top = "0";
				unarchiveProgress.style.height = "100%";
				unarchiveProgress.style.width = "0%";
				unarchiveProgress.style.background =
					"var(--interactive-accent)";
				unarchiveProgress.style.opacity = "0.3";
				unarchiveProgress.style.transition = "width 0.1s linear";
				unarchiveProgress.style.zIndex = "0";
				unarchiveProgress.style.pointerEvents = "none";

				// ボタンテキストを前面に
				unarchiveBtn.style.zIndex = "1";
				unarchiveBtn.style.position = "relative";

				// 長押し検出用
				let unarchiveLongPressTimer: number | null = null;
				let unarchiveExecuted = false; // 長押しで実行済みフラグ
				let unarchiveProgressInterval: number | null = null;
				let unarchiveWasLongPress = false; // 長押しを開始したかどうか
				let unarchiveExecutionTimer: number | null = null; // 50ms待機中のタイマー
				let unarchiveCancelled = false; // 50ms待機中にキャンセルされたかどうか

				unarchiveBtn.addEventListener("mousedown", () => {
					unarchiveExecuted = false;
					unarchiveWasLongPress = true; // 長押し開始
					unarchiveCancelled = false; // リセット
					unarchiveProgress.style.width = "0%";
					// 既存の実行待機タイマーがあればキャンセル
					if (unarchiveExecutionTimer) {
						clearTimeout(unarchiveExecutionTimer);
						unarchiveExecutionTimer = null;
					}

					// プログレスバーアニメーション
					let startTime = Date.now();
					unarchiveProgressInterval = window.setInterval(() => {
						const elapsed = Date.now() - startTime;
						const progress = Math.min((elapsed / 1000) * 100, 100);
						unarchiveProgress.style.width = `${progress}%`;
					}, 10);

					unarchiveLongPressTimer = window.setTimeout(async () => {
						// 1000ms長押し完了
						unarchiveLongPressTimer = null;
						if (unarchiveProgressInterval) {
							clearInterval(unarchiveProgressInterval);
							unarchiveProgressInterval = null;
						}
						unarchiveProgress.style.width = "100%";
						// プログレスバーが100%に達してから実行（視覚的なマージン）
						// この50ms待機中もキャンセル可能にする
						unarchiveCancelled = false; // リセット
						unarchiveExecutionTimer = window.setTimeout(
							async () => {
								unarchiveExecutionTimer = null;
								// 50ms待機中にキャンセルされていない場合のみ実行
								if (unarchiveCancelled || unarchiveExecuted) {
									// キャンセルされたか、既に実行済み
									unarchiveProgress.style.width = "0%";
									return;
								}
								unarchiveExecuted = true;
								unarchiveWasLongPress = false;
								await this.archivePost(file, false, true);
								unarchiveProgress.style.width = "0%";
							},
							50
						);
					}, 1000);
				});

				unarchiveBtn.addEventListener("mouseup", () => {
					// 長押しを途中で辞めた場合、通常のクリックとして実行しない
					if (unarchiveLongPressTimer) {
						unarchiveWasLongPress = true; // 長押しを途中で辞めた
						clearTimeout(unarchiveLongPressTimer);
						unarchiveLongPressTimer = null;
					}
					// 50ms待機中の実行もキャンセル
					if (unarchiveExecutionTimer) {
						unarchiveCancelled = true; // キャンセル
						clearTimeout(unarchiveExecutionTimer);
						unarchiveExecutionTimer = null;
					}
					if (unarchiveProgressInterval) {
						clearInterval(unarchiveProgressInterval);
						unarchiveProgressInterval = null;
					}
					unarchiveProgress.style.width = "0%";
				});

				unarchiveBtn.addEventListener("mouseleave", () => {
					// 長押しを途中で辞めた場合、通常のクリックとして実行しない
					if (unarchiveLongPressTimer) {
						unarchiveWasLongPress = true; // 長押しを途中で辞めた
						clearTimeout(unarchiveLongPressTimer);
						unarchiveLongPressTimer = null;
					}
					// 50ms待機中の実行もキャンセル
					if (unarchiveExecutionTimer) {
						unarchiveCancelled = true; // キャンセル
						clearTimeout(unarchiveExecutionTimer);
						unarchiveExecutionTimer = null;
					}
					if (unarchiveProgressInterval) {
						clearInterval(unarchiveProgressInterval);
						unarchiveProgressInterval = null;
					}
					unarchiveProgress.style.width = "0%";
				});

				unarchiveBtn.addEventListener("click", async (e) => {
					e.stopPropagation();
					// 長押しで既に実行済みの場合は何もしない
					if (unarchiveExecuted) {
						unarchiveExecuted = false;
						unarchiveWasLongPress = false;
						return;
					}
					// 長押しを途中で辞めた場合は何もしない（キャンセル）
					if (unarchiveWasLongPress) {
						unarchiveWasLongPress = false;
						return;
					}
					// 通常のクリックは確認なしで実行
					await this.archivePost(file, false, true);
				});
			} else {
				const archiveBtn = bottomActions.createEl("button", {
					text: "📁 アーカイブ",
					cls: "brainstall-bottom-action-btn",
				});
				archiveBtn.style.position = "relative";
				archiveBtn.style.overflow = "hidden";

				// プログレスバー
				const archiveProgress = archiveBtn.createEl("div", {
					cls: "brainstall-progress-bar",
				});
				archiveProgress.style.position = "absolute";
				archiveProgress.style.left = "0";
				archiveProgress.style.top = "0";
				archiveProgress.style.height = "100%";
				archiveProgress.style.width = "0%";
				archiveProgress.style.background = "var(--interactive-accent)";
				archiveProgress.style.opacity = "0.3";
				archiveProgress.style.transition = "width 0.1s linear";
				archiveProgress.style.zIndex = "0";
				archiveProgress.style.pointerEvents = "none";

				// ボタンテキストを前面に
				archiveBtn.style.zIndex = "1";
				archiveBtn.style.position = "relative";

				// 長押し検出用
				let archiveLongPressTimer: number | null = null;
				let archiveExecuted = false; // 長押しで実行済みフラグ
				let archiveProgressInterval: number | null = null;
				let archiveWasLongPress = false; // 長押しを開始したかどうか
				let archiveExecutionTimer: number | null = null; // 50ms待機中のタイマー
				let archiveCancelled = false; // 50ms待機中にキャンセルされたかどうか

				archiveBtn.addEventListener("mousedown", () => {
					archiveExecuted = false;
					archiveWasLongPress = true; // 長押し開始
					archiveCancelled = false; // リセット
					archiveProgress.style.width = "0%";
					// 既存の実行待機タイマーがあればキャンセル
					if (archiveExecutionTimer) {
						clearTimeout(archiveExecutionTimer);
						archiveExecutionTimer = null;
					}

					// プログレスバーアニメーション
					let startTime = Date.now();
					archiveProgressInterval = window.setInterval(() => {
						const elapsed = Date.now() - startTime;
						const progress = Math.min((elapsed / 1000) * 100, 100);
						archiveProgress.style.width = `${progress}%`;
					}, 10);

					archiveLongPressTimer = window.setTimeout(async () => {
						// 1000ms長押し完了
						archiveLongPressTimer = null;
						if (archiveProgressInterval) {
							clearInterval(archiveProgressInterval);
							archiveProgressInterval = null;
						}
						archiveProgress.style.width = "100%";
						// プログレスバーが100%に達してから実行（視覚的なマージン）
						// この50ms待機中もキャンセル可能にする
						archiveCancelled = false; // リセット
						archiveExecutionTimer = window.setTimeout(async () => {
							archiveExecutionTimer = null;
							// 50ms待機中にキャンセルされていない場合のみ実行
							if (archiveCancelled || archiveExecuted) {
								// キャンセルされたか、既に実行済み
								archiveProgress.style.width = "0%";
								return;
							}
							archiveExecuted = true;
							archiveWasLongPress = false;
							await this.archivePost(file, true, true);
							archiveProgress.style.width = "0%";
						}, 50);
					}, 1000);
				});

				archiveBtn.addEventListener("mouseup", () => {
					// 長押しを途中で辞めた場合、通常のクリックとして実行しない
					if (archiveLongPressTimer) {
						archiveWasLongPress = true; // 長押しを途中で辞めた
						clearTimeout(archiveLongPressTimer);
						archiveLongPressTimer = null;
					}
					// 50ms待機中の実行もキャンセル
					if (archiveExecutionTimer) {
						archiveCancelled = true; // キャンセル
						clearTimeout(archiveExecutionTimer);
						archiveExecutionTimer = null;
					}
					if (archiveProgressInterval) {
						clearInterval(archiveProgressInterval);
						archiveProgressInterval = null;
					}
					archiveProgress.style.width = "0%";
				});

				archiveBtn.addEventListener("mouseleave", () => {
					// 長押しを途中で辞めた場合、通常のクリックとして実行しない
					if (archiveLongPressTimer) {
						archiveWasLongPress = true; // 長押しを途中で辞めた
						clearTimeout(archiveLongPressTimer);
						archiveLongPressTimer = null;
					}
					// 50ms待機中の実行もキャンセル
					if (archiveExecutionTimer) {
						archiveCancelled = true; // キャンセル
						clearTimeout(archiveExecutionTimer);
						archiveExecutionTimer = null;
					}
					if (archiveProgressInterval) {
						clearInterval(archiveProgressInterval);
						archiveProgressInterval = null;
					}
					archiveProgress.style.width = "0%";
				});

				archiveBtn.addEventListener("click", async (e) => {
					e.stopPropagation();
					// 長押しで既に実行済みの場合は何もしない
					if (archiveExecuted) {
						archiveExecuted = false;
						archiveWasLongPress = false;
						return;
					}
					// 長押しを途中で辞めた場合は何もしない（キャンセル）
					if (archiveWasLongPress) {
						archiveWasLongPress = false;
						return;
					}
					// 通常のクリックは確認なしで実行
					await this.archivePost(file, true, true);
				});
			}

			// 右：Topicsに追加ボタン（contextがある場合のみ表示）
			if (hasContext) {
				const moveBtn = bottomActions.createEl("button", {
					text: "Topicsに追加",
					cls: "brainstall-bottom-action-btn",
				});
				moveBtn.setAttribute("title", "Topicsに追加");
				moveBtn.style.position = "relative";
				moveBtn.style.overflow = "hidden";

				// プログレスバー
				const moveProgress = moveBtn.createEl("div", {
					cls: "brainstall-progress-bar",
				});
				moveProgress.style.position = "absolute";
				moveProgress.style.left = "0";
				moveProgress.style.top = "0";
				moveProgress.style.height = "100%";
				moveProgress.style.width = "0%";
				moveProgress.style.background = "var(--interactive-accent)";
				moveProgress.style.opacity = "0.3";
				moveProgress.style.transition = "width 0.1s linear";
				moveProgress.style.zIndex = "0";
				moveProgress.style.pointerEvents = "none";

				// ボタンテキストを前面に
				moveBtn.style.zIndex = "1";
				moveBtn.style.position = "relative";

				// 長押し検出用
				let moveLongPressTimer: number | null = null;
				let moveExecuted = false; // 長押しで実行済みフラグ
				let moveProgressInterval: number | null = null;
				let moveWasLongPress = false; // 長押しを開始したかどうか
				let moveExecutionTimer: number | null = null; // 50ms待機中のタイマー
				let moveCancelled = false; // 50ms待機中にキャンセルされたかどうか

				moveBtn.addEventListener("mousedown", () => {
					moveExecuted = false;
					moveWasLongPress = true; // 長押し開始
					moveCancelled = false; // リセット
					moveProgress.style.width = "0%";
					// 既存の実行待機タイマーがあればキャンセル
					if (moveExecutionTimer) {
						clearTimeout(moveExecutionTimer);
						moveExecutionTimer = null;
					}

					// プログレスバーアニメーション
					let startTime = Date.now();
					moveProgressInterval = window.setInterval(() => {
						const elapsed = Date.now() - startTime;
						const progress = Math.min((elapsed / 1000) * 100, 100);
						moveProgress.style.width = `${progress}%`;
					}, 10);

					moveLongPressTimer = window.setTimeout(async () => {
						// 1000ms長押し完了
						moveLongPressTimer = null;
						if (moveProgressInterval) {
							clearInterval(moveProgressInterval);
							moveProgressInterval = null;
						}
						moveProgress.style.width = "100%";
						// プログレスバーが100%に達してから実行（視覚的なマージン）
						// この50ms待機中もキャンセル可能にする
						moveCancelled = false; // リセット
						moveExecutionTimer = window.setTimeout(async () => {
							moveExecutionTimer = null;
							// 50ms待機中にキャンセルされていない場合のみ実行
							if (moveCancelled || moveExecuted) {
								// キャンセルされたか、既に実行済み
								moveProgress.style.width = "0%";
								return;
							}
							moveExecuted = true;
							moveWasLongPress = false;
							await this.moveToTopics(file, true);
							moveProgress.style.width = "0%";
						}, 50);
					}, 1000);
				});

				moveBtn.addEventListener("mouseup", () => {
					// 長押しを途中で辞めた場合、通常のクリックとして実行しない
					if (moveLongPressTimer) {
						moveWasLongPress = true; // 長押しを途中で辞めた
						clearTimeout(moveLongPressTimer);
						moveLongPressTimer = null;
					}
					// 50ms待機中の実行もキャンセル
					if (moveExecutionTimer) {
						moveCancelled = true; // キャンセル
						clearTimeout(moveExecutionTimer);
						moveExecutionTimer = null;
					}
					if (moveProgressInterval) {
						clearInterval(moveProgressInterval);
						moveProgressInterval = null;
					}
					moveProgress.style.width = "0%";
				});

				moveBtn.addEventListener("mouseleave", () => {
					// 長押しを途中で辞めた場合、通常のクリックとして実行しない
					if (moveLongPressTimer) {
						moveWasLongPress = true; // 長押しを途中で辞めた
						clearTimeout(moveLongPressTimer);
						moveLongPressTimer = null;
					}
					// 50ms待機中の実行もキャンセル
					if (moveExecutionTimer) {
						moveCancelled = true; // キャンセル
						clearTimeout(moveExecutionTimer);
						moveExecutionTimer = null;
					}
					if (moveProgressInterval) {
						clearInterval(moveProgressInterval);
						moveProgressInterval = null;
					}
					moveProgress.style.width = "0%";
				});

				moveBtn.addEventListener("click", async (e) => {
					e.stopPropagation();
					// 長押しで既に実行済みの場合は何もしない
					if (moveExecuted) {
						moveExecuted = false;
						moveWasLongPress = false;
						return;
					}
					// 長押しを途中で辞めた場合は何もしない（キャンセル）
					if (moveWasLongPress) {
						moveWasLongPress = false;
						return;
					}
					// 通常のクリックは確認なしで実行
					await this.moveToTopics(file, true);
				});
			} else {
				// contextがない場合でもスペースを確保するため空のdivを追加
				bottomActions.createEl("div");
			}

			// クリックでファイルを開く（ハッシュタグクリックでない場合のみ）
			postEl.addEventListener("click", (e) => {
				const target = e.target as HTMLElement;
				// ハッシュタグがクリックされた場合はファイルを開かない
				if (target.textContent && target.textContent.startsWith("#")) {
					return;
				}
				if (target.closest("a")) {
					return;
				}
				this.app.workspace.openLinkText(file.path, "", false);
			});
		}

		// スクロール位置を復元
		const postsListEl = this.postsContainer?.querySelector(
			".brainstall-posts-list"
		);
		if (postsListEl && savedScrollTop > 0) {
			requestAnimationFrame(() => {
				(postsListEl as HTMLElement).scrollTop = savedScrollTop;
			});
		}
	}

	async updateGrass() {
		// 過去84日間（12週間）の草を表示
		const days = ["日", "月", "火", "水", "木", "金", "土"];
		this.grassContainer.empty();

		// 過去84日間の通知数を取得
		const stats = await this.getPostStats();
		const maxCount = Math.max(...Object.values(stats), 1);

		// グリッドコンテナ（縦7、横12）
		const gridContainer = this.grassContainer.createEl("div", {
			cls: "brainstall-grass-grid",
		});

		// ヘッダー行（週番号）- 左が古く、右が新しい
		const headerRow = gridContainer.createEl("div", {
			cls: "brainstall-grass-row header",
		});
		headerRow.createEl("div", { text: "" }); // 左側のスペース（曜日ラベルの位置）
		for (let week = 0; week <= 11; week++) {
			headerRow.createEl("div", {
				text: "",
				cls: "brainstall-grass-day-header",
			});
		}

		// 今日を基準に、過去84日間の各曜日の日付を計算
		const today = new Date();
		const todayDayOfWeek = today.getDay(); // 0=日曜, 6=土曜

		// 縦7列（日～土）×横12（週）
		for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
			const rowEl = gridContainer.createEl("div", {
				cls: "brainstall-grass-row",
			});

			// 左側のラベル（曜日）
			rowEl.createEl("div", {
				text: days[dayOfWeek],
				cls: "brainstall-grass-week-label",
			});

			// 12週分のセル - 左が古く、右が新しい
			for (let week = 0; week <= 11; week++) {
				// この曜日の日付を計算
				// week=0が11週前、week=11が今週
				const weeksAgo = 11 - week;

				// その週の日曜日は何日前か
				// 今日が何曜日かによって、その週の日曜日までの日数が変わる
				const daysToSunday = todayDayOfWeek;
				const sundayDaysAgo = weeksAgo * 7 + daysToSunday;

				// この曜日は日曜日から何日目か
				const thisDayDaysAgo = sundayDaysAgo - dayOfWeek;

				const date = new Date(today);
				date.setDate(date.getDate() - thisDayDaysAgo);

				const dateKey = `${date.getFullYear()}${String(
					date.getMonth() + 1
				).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
				const count = stats[dateKey] || 0;

				// 濃淡を計算（0通知は透明、最大通知は完全な色）
				const opacity =
					count > 0 ? Math.min(0.3 + (count / maxCount) * 0.7, 1) : 0;

				const cell = rowEl.createEl("div", {
					cls: "brainstall-grass-cell",
					attr: {
						title: `${date.toLocaleDateString(
							"ja-JP"
						)}: ${count}通知`,
					},
				});

				// 通知数が0でない場合は濃い色、0の場合は薄い色
				if (count > 0) {
					cell.textContent = String(count);
					cell.style.backgroundColor = `color-mix(in srgb, var(--interactive-accent) ${
						opacity * 100
					}%, transparent)`;
					cell.style.color =
						opacity > 0.6 ? "white" : "var(--text-normal)";
					cell.style.opacity = "1";
				} else {
					cell.style.backgroundColor =
						"var(--background-modifier-border)";
					cell.style.opacity = "0.3";
				}
			}
		}
	}

	async getPostStats() {
		// 設定フォルダ内のファイルをカウント
		const stats: Record<string, number> = {};
		const baseFolder =
			this.plugin.settings.notificationFolder || "Archives/Notifications";

		try {
			const files = this.app.vault.getFiles();
			for (const file of files) {
				if (file.path.startsWith(baseFolder + "/")) {
					let dateKey: string | null = null;

					// frontmatterのcreatedを優先的に使用
					try {
						const content = await this.app.vault.read(file);
						const frontmatter = this.getFrontmatter(content);
						if (frontmatter?.created) {
							const date = new Date(frontmatter.created);
							dateKey = date
								.toISOString()
								.slice(0, 10)
								.replace(/-/g, "");
						}
					} catch (error) {
						// フォールバック: ファイル名から抽出
						const match = file.path.match(/(\d{8})\//);
						if (match) {
							dateKey = match[1];
						}
					}

					// フォールバック: ファイル名から抽出（frontmatterの読み込みに失敗した場合）
					if (!dateKey) {
						const match = file.path.match(/(\d{8})\//);
						if (match) {
							dateKey = match[1];
						}
					}

					if (dateKey) {
						stats[dateKey] = (stats[dateKey] || 0) + 1;
					}
				}
			}
		} catch (error) {
			console.error("Stats error:", error);
		}

		return stats;
	}

	async updateStats() {
		// 統計情報を取得
		const baseFolder =
			this.plugin.settings.notificationFolder || "Archives/Notifications";
		const files = this.app.vault
			.getFiles()
			.filter((f) => f.path.startsWith(baseFolder + "/"));

		const totalPosts = files.length;
		const uniqueDays = new Set();
		let totalChars = 0;
		let activePosts = 0;
		let archivedPosts = 0;

		for (const file of files) {
			// 文字数をカウント
			try {
				const content = await this.app.vault.read(file);
				totalChars += content.length;

				// アーカイブ済みかどうかをチェック
				const isArchived =
					content.includes("archived: true") ||
					content.includes("status: archived");
				if (isArchived) {
					archivedPosts++;
				} else {
					activePosts++;
				}

				// frontmatterのcreatedを優先的に使用
				const frontmatter = this.getFrontmatter(content);
				let dateKey: string | null = null;

				if (frontmatter?.created) {
					const date = new Date(frontmatter.created);
					dateKey = date.toISOString().slice(0, 10).replace(/-/g, "");
				}

				// フォールバック: ファイル名から抽出
				if (!dateKey) {
					const match = file.path.match(/(\d{8})\//);
					if (match) {
						dateKey = match[1];
					}
				}

				if (dateKey) {
					uniqueDays.add(dateKey);
				}
			} catch (e) {
				// エラーは無視
			}
		}

		const totalDays = uniqueDays.size;
		const avgCharsPerDay =
			totalDays > 0
				? Math.round(totalChars / totalDays).toLocaleString()
				: "0";

		this.statsContainer.empty();

		// 進捗（草）セクション
		this.statsContainer.createEl("h3", {
			text: "📅 進捗",
			cls: "brainstall-grass-title",
		});
		// grassContainerを再作成（empty()で削除されているため）
		this.grassContainer = this.statsContainer.createEl("div", {
			cls: "brainstall-grass",
		});
		// updateGrassで表示を更新

		// 統計カードセクション
		this.statsContainer.createEl("h3", {
			text: "📊 統計",
			cls: "brainstall-grass-title",
			attr: { style: "margin-top: 30px;" },
		});

		// 統計カード
		const statsGrid = this.statsContainer.createEl("div", {
			cls: "brainstall-stats-grid",
		});

		// アーカイブ数
		const card1 = statsGrid.createEl("div", {
			cls: "brainstall-stat-card",
		});
		card1.createEl("div", {
			text: "📝 アーカイブ数",
			cls: "brainstall-stat-label",
		});
		card1.createEl("div", {
			text: `${archivedPosts} / ${totalPosts}`,
			cls: "brainstall-stat-value",
		});

		// 合計日数
		const card2 = statsGrid.createEl("div", {
			cls: "brainstall-stat-card",
		});
		card2.createEl("div", {
			text: "📅 通知した日数",
			cls: "brainstall-stat-label",
		});
		card2.createEl("div", {
			text: String(totalDays),
			cls: "brainstall-stat-value",
		});

		// 1日あたり平均文字数
		const card3 = statsGrid.createEl("div", {
			cls: "brainstall-stat-card",
		});
		card3.createEl("div", {
			text: "📊 1日あたり平均文字数",
			cls: "brainstall-stat-label",
		});
		card3.createEl("div", {
			text: avgCharsPerDay,
			cls: "brainstall-stat-value",
		});

		// 合計文字数
		const card4 = statsGrid.createEl("div", {
			cls: "brainstall-stat-card",
		});
		card4.createEl("div", {
			text: "✍️ 合計文字数",
			cls: "brainstall-stat-label",
		});
		card4.createEl("div", {
			text: totalChars.toLocaleString(),
			cls: "brainstall-stat-value",
		});
	}

	async archivePost(
		file: TFile,
		archive: boolean,
		skipConfirm: boolean = false
	) {
		// 確認ダイアログは削除（通常クリックと長押しの両方で確認なしで実行）

		try {
			// スクロール位置を保存
			const activePostsList = this.postsContainer?.querySelector(
				".brainstall-posts-list"
			);
			const savedScrollTop = activePostsList
				? (activePostsList as HTMLElement).scrollTop
				: 0;

			let content = await this.app.vault.read(file);

			// frontmatterの追加/更新
			if (archive) {
				// アーカイブする
				if (content.match(/^---[\s\S]*?---/)) {
					// frontmatterが既にある場合
					if (
						content.includes("archived:") ||
						content.includes("status:")
					) {
						content = content.replace(
							/archived:\s*(true|false)/,
							`archived: true`
						);
						content = content.replace(
							/status:\s*[^\n]+/,
							"status: archived"
						);
					} else {
						content = content.replace(
							/^---([\s\S]*?)---/,
							(match, fm) => {
								return `---${fm}\narchived: true\nstatus: archived\n---`;
							}
						);
					}
				} else {
					// frontmatterがない場合は追加
					content = `---\narchived: true\nstatus: archived\n---\n${content}`;
				}
			} else {
				// アーカイブ解除
				content = content.replace(
					/archived:\s*true/g,
					"archived: false"
				);
				content = content.replace(
					/status:\s*archived/g,
					"status: active"
				);
			}

			await this.app.vault.modify(file, content);
			await this.updatePosts();

			// スクロール位置を復元
			if (activePostsList) {
				requestAnimationFrame(() => {
					(activePostsList as HTMLElement).scrollTop = savedScrollTop;
				});
			}

			new Notice(archive ? "アーカイブしました" : "復元しました");
		} catch (error) {
			new Notice(`エラー: ${error}`);
		}
	}

	async setPriority(file: TFile, priority: number) {
		try {
			// スクロール位置を保存
			const activePostsList = this.postsContainer?.querySelector(
				".brainstall-posts-list"
			);
			const savedScrollTop = activePostsList
				? (activePostsList as HTMLElement).scrollTop
				: 0;

			let content = await this.app.vault.read(file);

			// frontmatterの追加/更新
			if (content.match(/^---[\s\S]*?---/)) {
				// frontmatterが既にある場合
				if (content.includes("priority:")) {
					content = content.replace(
						/priority:\s*\d+/,
						`priority: ${priority}`
					);
				} else {
					content = content.replace(
						/^---([\s\S]*?)---/,
						(match, fm) => {
							return `---${fm}\npriority: ${priority}\n---`;
						}
					);
				}
			} else {
				// frontmatterがない場合は追加
				content = `---\npriority: ${priority}\n---\n\n${content}`;
			}

			await this.app.vault.modify(file, content);

			// リストを更新
			await this.updatePosts();

			// スクロール位置を復元
			if (activePostsList) {
				requestAnimationFrame(() => {
					(activePostsList as HTMLElement).scrollTop = savedScrollTop;
				});
			}
		} catch (error) {
			new Notice(`エラー: ${error}`);
		}
	}

	async togglePin(file: TFile) {
		try {
			// スクロール位置を保存
			const activePostsList = this.postsContainer?.querySelector(
				".brainstall-posts-list"
			);
			const savedScrollTop = activePostsList
				? (activePostsList as HTMLElement).scrollTop
				: 0;

			let content = await this.app.vault.read(file);

			// 現在のピン状態を確認
			const isPinned = content.includes("pinned: true");

			// frontmatterの追加/更新
			if (content.match(/^---[\s\S]*?---/)) {
				// frontmatterが既にある場合
				if (content.includes("pinned:")) {
					content = content.replace(
						/pinned:\s*(true|false)/,
						`pinned: ${!isPinned}`
					);
				} else {
					content = content.replace(
						/^---([\s\S]*?)---/,
						(match, fm) => {
							return `---${fm}\npinned: ${!isPinned}\n---`;
						}
					);
				}
			} else {
				// frontmatterがない場合は追加
				content = `---\npinned: ${!isPinned}\n---\n${content}`;
			}

			await this.app.vault.modify(file, content);
			await this.updatePosts();

			// スクロール位置を復元
			if (activePostsList) {
				requestAnimationFrame(() => {
					(activePostsList as HTMLElement).scrollTop = savedScrollTop;
				});
			}

			new Notice(
				!isPinned ? "ピン留めしました" : "ピン留めを解除しました"
			);
		} catch (error) {
			new Notice(`エラー: ${error}`);
		}
	}

	async deletePost(file: TFile) {
		try {
			// スクロール位置を保存
			const activePostsList = this.postsContainer?.querySelector(
				".brainstall-posts-list"
			);
			const savedScrollTop = activePostsList
				? (activePostsList as HTMLElement).scrollTop
				: 0;

			await this.app.vault.delete(file);
			await this.updatePosts();
			await this.updateGrass();
			await this.updateStats();

			// スクロール位置を復元
			if (activePostsList) {
				requestAnimationFrame(() => {
					(activePostsList as HTMLElement).scrollTop = savedScrollTop;
				});
			}

			new Notice("削除しました");
		} catch (error) {
			new Notice(`エラー: ${error}`);
		}
	}

	async sharePost(file: TFile) {
		try {
			const content = await this.app.vault.read(file);

			// Boundaryフィールドからcontextを取得
			const contextMatch = content.match(/context:\s*"([^"]+)"/);
			const context = contextMatch ? contextMatch[1] : file.basename;

			// frontmatterを除いた内容を取得
			const cleanContent = content
				.replace(/^---[\s\S]*?---\n?/, "")
				.trim();

			// Markdownリンク形式で共有用テキストを作成
			const shareText = `[[${file.basename}]]\n\n${cleanContent}`;

			// クリップボードにコピー
			if (navigator.clipboard && navigator.clipboard.writeText) {
				await navigator.clipboard.writeText(shareText);
				new Notice("✅ クリップボードにコピーしました");
			} else {
				// フォールバック: 古いブラウザ用
				const textarea = document.createElement("textarea");
				textarea.value = shareText;
				document.body.appendChild(textarea);
				textarea.select();
				document.execCommand("copy");
				document.body.removeChild(textarea);
				new Notice("✅ クリップボードにコピーしました");
			}
		} catch (error) {
			new Notice(`エラー: ${error}`);
		}
	}

	async moveToTopics(file: TFile, skipConfirm: boolean = false) {
		// 確認ダイアログは削除（通常クリックと長押しの両方で確認なしで実行）

		try {
			// スクロール位置を保存
			const activePostsList = this.postsContainer?.querySelector(
				".brainstall-posts-list"
			);
			const savedScrollTop = activePostsList
				? (activePostsList as HTMLElement).scrollTop
				: 0;

			const targetFolder =
				this.plugin.settings.analysisFolder || "Topics";

			// フォルダが存在しない場合は作成
			if (!(await this.app.vault.adapter.exists(targetFolder))) {
				await this.app.vault.createFolder(targetFolder);
			}

			// frontmatterからcontextを取得
			const content = await this.app.vault.read(file);
			const contextMatch = content.match(/context:\s*"([^"]+)"/);
			const context = contextMatch ? contextMatch[1] : "深掘り記事";

			// ファイル名に使用できない文字をエスケープ
			const sanitizedContext = context.replace(/[<>:"/\\|?*]/g, "-");

			// ファイル名を生成（contextベース）
			const targetFileName = `${sanitizedContext}.md`;
			const newPath = `${targetFolder}/${targetFileName}`;

			// 既存のファイルがある場合は追記
			if (await this.app.vault.adapter.exists(newPath)) {
				const existingFile = this.app.vault.getAbstractFileByPath(
					newPath
				) as TFile;
				if (existingFile) {
					const existingContent = await this.app.vault.read(
						existingFile
					);
					const deepDiveContent = content
						.replace(/^---[\s\S]*?---\n?/, "")
						.trim();
					const newContent = `${existingContent}\n\n---\n\n${deepDiveContent}`;
					await this.app.vault.modify(existingFile, newContent);

					new Notice(`✅ "${context}"に追記しました`);

					// 追記の通知を作成
					await this.createTopicUpdateNotification(context, newPath);
				}
			} else {
				// ファイルをコピーしてTopicsに作成
				await this.app.vault.copy(file, newPath);
				new Notice("✅ Topicsに追加しました");

				// 通知を作成
				await this.createTopicNotification(context, newPath);
			}

			await this.updatePosts();
			await this.updateGrass();
			await this.updateStats();

			// スクロール位置を復元
			if (activePostsList) {
				requestAnimationFrame(() => {
					(activePostsList as HTMLElement).scrollTop = savedScrollTop;
				});
			}
		} catch (error) {
			new Notice(`エラー: ${error}`);
		}
	}

	async createTopicNotification(context: string, topicPath: string) {
		// 通知用のタイムスタンプを生成
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		const hours = String(now.getHours()).padStart(2, "0");
		const minutes = String(now.getMinutes()).padStart(2, "0");
		const seconds = String(now.getSeconds()).padStart(2, "0");

		const timestamp =
			this.plugin.settings.timestampFormat === "ISO"
				? now.toISOString().replace(/[:.]/g, "-").slice(0, -5)
				: `${year}${month}${day}_${hours}${minutes}${seconds}`;

		const topicName = context; // wikilink用に元のcontextを使用

		const notificationContent = `新しいトピックス[[${topicName}]]が作成されました。`;

		const baseFolder =
			this.plugin.settings.notificationFolder || "Archives/Notifications";
		const folderPath = this.getDateFolderPath(baseFolder, now);
		const fileName = `${timestamp}.md`;

		// フォルダが存在しない場合は作成
		await this.ensureFolderExists(folderPath);

		const notificationPath = `${folderPath}/${fileName}`;
		await this.app.vault.create(notificationPath, notificationContent);
	}

	async archiveFile(file: TFile) {
		// ファイルを読み込む
		const content = await this.app.vault.read(file);

		// frontmatterにarchived: trueを追加
		let updatedContent = content;
		if (content.startsWith("---")) {
			// frontmatterが存在する場合
			updatedContent = content.replace(
				/---\n([\s\S]*?)---/,
				(match, fmContent) => {
					// 既にarchivedがあれば上書き、なければ追加
					if (fmContent.includes("archived:")) {
						return `---\n${fmContent.replace(
							/archived:\s*[^\n]+/,
							"archived: true"
						)}\n---`;
					} else {
						return `---\n${fmContent}archived: true\n---`;
					}
				}
			);
		} else {
			// frontmatterがない場合は追加
			updatedContent = `---\narchived: true\n---\n\n${content}`;
		}

		// ファイルを更新
		await this.app.vault.modify(file, updatedContent);
	}

	async createTopicUpdateNotification(context: string, topicPath: string) {
		// 通知用のタイムスタンプを生成
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		const hours = String(now.getHours()).padStart(2, "0");
		const minutes = String(now.getMinutes()).padStart(2, "0");
		const seconds = String(now.getSeconds()).padStart(2, "0");

		const timestamp =
			this.plugin.settings.timestampFormat === "ISO"
				? now.toISOString().replace(/[:.]/g, "-").slice(0, -5)
				: `${year}${month}${day}_${hours}${minutes}${seconds}`;

		const topicName = context; // wikilink用に元のcontextを使用

		const notificationContent = `トピックス[[${topicName}]]が更新されました。`;

		const baseFolder =
			this.plugin.settings.notificationFolder || "Archives/Notifications";
		const folderPath = this.getDateFolderPath(baseFolder, now);
		const fileName = `${timestamp}.md`;

		// フォルダが存在しない場合は作成
		await this.ensureFolderExists(folderPath);

		const notificationPath = `${folderPath}/${fileName}`;
		await this.app.vault.create(notificationPath, notificationContent);
	}

	async updateReference() {
		this.referenceContainer.empty();

		// 選択されたファイルまたはアクティブファイルを取得（updateActiveFileDisplayと同じロジック）
		let targetFile: TFile | null = null;

		// selectedFileがundefined（初期状態）の場合はアクティブファイルを使用
		// selectedFileがnull（クリア済み）の場合は何も表示しない
		// selectedFileがTFile（手動選択済み）の場合はそのファイルを表示
		if (this.selectedFile !== undefined) {
			targetFile = this.selectedFile;
		} else {
			targetFile = this.app.workspace.getActiveFile();
		}

		// ファイル選択ヘッダー
		const header = this.referenceContainer.createEl("div", {
			cls: "brainstall-reference-header",
		});

		// ヘッダーのタイトル行
		const titleRow = header.createEl("div", {
			cls: "brainstall-reference-title-row",
		});
		titleRow.style.display = "flex";
		titleRow.style.alignItems = "center";
		titleRow.style.justifyContent = "space-between";
		titleRow.style.marginBottom = "20px";

		const title = titleRow.createEl("h3", {
			text: "🔗 参照",
		});
		title.style.margin = "0";

		// 更新ボタン
		const refreshBtn = titleRow.createEl("button", {
			text: "🔄",
			cls: "brainstall-refresh-btn",
			attr: { title: "更新" },
		});
		refreshBtn.addEventListener("click", async () => {
			// ファイルが選択されていない場合はアクティブファイルを選択
			if (!this.selectedFile) {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					this.selectedFile = activeFile;
					this.updateActiveFileDisplay();
				}
			}
			await this.updateReference();
			new Notice("参照を更新しました");
		});

		const fileDisplay = header.createEl("div", {
			cls: "brainstall-reference-file-display",
		});
		fileDisplay.style.cursor = "pointer";
		fileDisplay.style.padding = "8px 12px";
		fileDisplay.style.marginBottom = "20px";
		fileDisplay.style.background = "var(--background-modifier-hover)";
		fileDisplay.style.borderRadius = "6px";
		fileDisplay.setAttribute("title", "クリックしてファイルを選択");

		fileDisplay.style.position = "relative";
		fileDisplay.style.display = "flex";
		fileDisplay.style.alignItems = "center";
		fileDisplay.style.paddingRight = "40px"; // クリアボタンのスペース
		fileDisplay.style.overflow = "hidden"; // 親要素でもoverflowを制御

		const fileDisplayContent = fileDisplay.createEl("span", {
			cls: "brainstall-reference-file-content",
		});
		fileDisplayContent.style.flex = "1";
		fileDisplayContent.style.minWidth = "0";
		fileDisplayContent.style.whiteSpace = "nowrap";
		fileDisplayContent.style.overflow = "hidden";
		fileDisplayContent.style.textOverflow = "ellipsis";

		if (!targetFile) {
			fileDisplayContent.textContent = "📄 ファイルが選択されていません";
			this.referenceContainer.createEl("p", {
				text: "ファイルを選択してください",
				cls: "brainstall-empty",
			});
		} else {
			fileDisplayContent.textContent = `📄 ${targetFile.basename}`;

			// クリアボタン（ファイルが選択されている場合のみ表示）
			const clearBtn = fileDisplay.createEl("button", {
				cls: "brainstall-clear-file-btn",
			}) as HTMLButtonElement;
			clearBtn.textContent = "×";
			clearBtn.setAttribute("title", "選択をクリア");
			clearBtn.style.position = "absolute";
			clearBtn.style.right = "8px";
			clearBtn.style.top = "50%";
			clearBtn.style.transform = "translateY(-50%)";
			clearBtn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.selectedFile = null;
				this.updateActiveFileDisplay();
				this.updateReference();
			});
		}

		// ファイル選択モーダルを開く機能を追加
		fileDisplay.addEventListener("click", (e) => {
			// クリアボタンがクリックされた場合はモーダルを開かない
			if (
				(e.target as HTMLElement).closest(".brainstall-clear-file-btn")
			) {
				return;
			}
			const files = this.app.vault.getMarkdownFiles();
			const modal = new FileSelectModal(
				this.app,
				files,
				(file: TFile) => {
					this.selectedFile = file;
					this.updateActiveFileDisplay();
					this.updateReference();
				}
			);
			modal.open();
		});

		if (!targetFile) {
			return;
		}

		// Backlinkセクション
		const backlinkSection = this.referenceContainer.createEl("div", {
			cls: "brainstall-reference-section",
		});
		backlinkSection.createEl("h4", {
			text: "🔙 バックリンク",
		});
		const backlinkList = backlinkSection.createEl("div", {
			cls: "brainstall-reference-list",
		});

		// Frontlinkセクション
		const frontlinkSection = this.referenceContainer.createEl("div", {
			cls: "brainstall-reference-section",
		});
		frontlinkSection.createEl("h4", {
			text: "🔗 フロントリンク",
		});
		const frontlinkList = frontlinkSection.createEl("div", {
			cls: "brainstall-reference-list",
		});

		// 関連キーワードセクション
		const keywordSection = this.referenceContainer.createEl("div", {
			cls: "brainstall-reference-section",
		});
		keywordSection.createEl("h4", {
			text: "🏷️ 関連キーワード",
		});
		const keywordList = keywordSection.createEl("div", {
			cls: "brainstall-reference-list",
		});

		try {
			// 現在のファイルの内容を取得
			const currentFileContent = await this.app.vault.read(targetFile);
			const currentHashtags = new Set<string>();
			const hashtagMatches = currentFileContent.matchAll(
				/#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g
			);
			for (const match of hashtagMatches) {
				currentHashtags.add(match[0].toLowerCase());
			}

			// 現在のファイルが参照しているファイルを取得（Frontlink）
			const frontlinks = this.extractWikilinks(currentFileContent);
			const frontlinkFiles = new Set<TFile>();
			for (const link of frontlinks) {
				const fileName = link.replace(/\[\[|\]\]/g, "");
				const file = this.app.vault
					.getMarkdownFiles()
					.find(
						(f) => f.basename === fileName || f.name === fileName
					);
				if (file && file.path !== targetFile.path) {
					frontlinkFiles.add(file);
				}
			}

			// 全てのファイルをスキャンしてBacklinkと関連キーワードを取得
			const allFiles = this.app.vault.getMarkdownFiles();
			const backlinkFiles = new Set<TFile>();
			const relatedKeywordFiles = new Map<TFile, Set<string>>();

			for (const file of allFiles) {
				if (file.path === targetFile.path) continue;

				try {
					const content = await this.app.vault.read(file);
					const fileName = targetFile.basename;

					// Backlink: このファイルを参照しているか
					if (content.includes(`[[${fileName}]]`)) {
						backlinkFiles.add(file);
					}

					// 関連キーワード: 共通のハッシュタグを取得
					const fileHashtags = new Set<string>();
					const matches = content.matchAll(
						/#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g
					);
					for (const match of matches) {
						fileHashtags.add(match[0].toLowerCase());
					}

					// 共通のタグを抽出
					const commonTags = new Set<string>();
					for (const tag of currentHashtags) {
						if (fileHashtags.has(tag)) {
							commonTags.add(tag);
						}
					}

					if (commonTags.size > 0) {
						relatedKeywordFiles.set(file, commonTags);
					}
				} catch (e) {
					// エラーは無視
				}
			}

			// Backlinkを表示
			if (backlinkFiles.size === 0) {
				backlinkList.createEl("p", {
					text: "バックリンクはありません",
					cls: "brainstall-empty",
				});
			} else {
				for (const file of Array.from(backlinkFiles).sort(
					(a, b) => b.stat.mtime - a.stat.mtime
				)) {
					await this.createReferenceItem(
						backlinkList,
						file,
						targetFile.path
					);
				}
			}

			// Frontlinkを表示
			if (frontlinkFiles.size === 0) {
				frontlinkList.createEl("p", {
					text: "フロントリンクはありません",
					cls: "brainstall-empty",
				});
			} else {
				for (const file of Array.from(frontlinkFiles).sort(
					(a, b) => b.stat.mtime - a.stat.mtime
				)) {
					await this.createReferenceItem(
						frontlinkList,
						file,
						targetFile.path
					);
				}
			}

			// 関連キーワードを表示（共通数でソート）
			if (relatedKeywordFiles.size === 0) {
				keywordList.createEl("p", {
					text: "関連キーワードはありません",
					cls: "brainstall-empty",
				});
			} else {
				const sortedRelated = Array.from(
					relatedKeywordFiles.entries()
				).sort((a, b) => b[1].size - a[1].size);
				for (const [file, commonTags] of sortedRelated) {
					await this.createReferenceItemWithKeywords(
						keywordList,
						file,
						targetFile.path,
						commonTags
					);
				}
			}
		} catch (error) {
			console.error("Reference update error:", error);
			this.referenceContainer.createEl("p", {
				text: `エラー: ${error}`,
				cls: "brainstall-empty",
			});
		}
	}

	async createReferenceItem(
		container: HTMLElement,
		file: TFile,
		currentFilePath: string
	) {
		const itemWrapper = container.createEl("div", {
			cls: "brainstall-reference-item-wrapper",
		});
		const item = itemWrapper.createEl("div", {
			cls: "brainstall-reference-item",
		});
		item.createEl("span", {
			text: file.basename,
		});
		await this.createReferenceItemContent(
			itemWrapper,
			item,
			file,
			currentFilePath
		);
	}

	async createReferenceItemWithKeywords(
		container: HTMLElement,
		file: TFile,
		currentFilePath: string,
		commonTags: Set<string>
	) {
		const itemWrapper = container.createEl("div", {
			cls: "brainstall-reference-item-wrapper",
		});
		const item = itemWrapper.createEl("div", {
			cls: "brainstall-reference-item",
		});

		const contentWrapper = item.createEl("div", {
			cls: "brainstall-reference-keyword-content",
		});
		contentWrapper.style.display = "flex";
		contentWrapper.style.flexDirection = "column";
		contentWrapper.style.flex = "1";
		contentWrapper.style.minWidth = "0";

		const fileNameSpan = contentWrapper.createEl("span", {
			text: file.basename,
		});

		// 共通キーワードを表示
		const keywordsSpan = contentWrapper.createEl("span", {
			cls: "brainstall-reference-keywords",
		});
		const tagsArray = Array.from(commonTags).sort();
		keywordsSpan.textContent = tagsArray.join(", ");
		keywordsSpan.style.fontSize = "12px";
		keywordsSpan.style.color = "var(--text-muted)";
		keywordsSpan.style.marginTop = "4px";

		await this.createReferenceItemContent(
			itemWrapper,
			item,
			file,
			currentFilePath
		);
	}

	async createReferenceItemContent(
		itemWrapper: HTMLElement,
		item: HTMLElement,
		file: TFile,
		currentFilePath: string
	) {
		// 本文プレビューエリア
		const previewArea = itemWrapper.createEl("div", {
			cls: "brainstall-reference-preview hidden",
		});

		let isExpanded = false;
		let contentLoaded = false;

		// 要素全体をクリック可能にする
		item.style.cursor = "pointer";
		item.addEventListener("click", async (e) => {
			if (!contentLoaded) {
				try {
					const content = await this.app.vault.read(file);
					// frontmatterを削除
					const cleanContent = content
						.replace(/^---[\s\S]*?---\n?/, "")
						.trim();

					const previewContent = previewArea.createEl("div", {
						cls: "brainstall-reference-preview-content",
					});

					// Markdownをレンダリング
					MarkdownRenderer.renderMarkdown(
						cleanContent,
						previewContent,
						file.path,
						this
					);

					// 一番下に「ソースを新しいタブで開く」ボタンを追加
					const openInNewTabBtn = previewArea.createEl("button", {
						cls: "brainstall-reference-open-newtab-btn",
						text: "📂 ソースを新しいタブで開く",
					});
					openInNewTabBtn.style.marginTop = "12px";
					openInNewTabBtn.style.width = "100%";
					openInNewTabBtn.addEventListener("click", (e) => {
						e.stopPropagation();
						const leaf = this.app.workspace.getLeaf(true);
						leaf.openFile(file);
					});

					contentLoaded = true;
				} catch (error) {
					previewArea.createEl("p", {
						text: `エラー: ${error}`,
						cls: "brainstall-empty",
					});
				}
			}

			isExpanded = !isExpanded;
			if (isExpanded) {
				previewArea.removeClass("hidden");
				item.addClass("expanded");
			} else {
				previewArea.addClass("hidden");
				item.removeClass("expanded");
			}
		});
	}

	async onClose() {
		// 全てのリスナーを削除
		this.saveListeners.forEach((cleanup) => cleanup());
		this.saveListeners = [];
	}
}

class BrainstallSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const { containerEl } = this;

		containerEl.empty();

		// MODEL_LIST定数からモデルリストを使用
		const modelsData = MODEL_LIST;

		// フォルダ設定セクション
		containerEl.createEl("h3", { text: "📁 フォルダ設定" });
		containerEl.createEl("p", {
			text: "各セクションの保存先フォルダを設定します",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("通知保存フォルダ")
			.setDesc("通知を保存するフォルダのパス")
			.addText((text) =>
				text
					.setPlaceholder("Archives/Notifications")
					.setValue(this.plugin.settings.notificationFolder)
					.onChange(async (value) => {
						this.plugin.settings.notificationFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("タイムスタンプフォーマット")
			.setDesc("ファイル名に使用するタイムスタンプのフォーマット")
			.addText((text) =>
				text
					.setPlaceholder("YYYYMMDD_HHmmss")
					.setValue(this.plugin.settings.timestampFormat)
					.onChange(async (value) => {
						this.plugin.settings.timestampFormat = value;
						await this.plugin.saveSettings();
					})
			);

		// AI設定セクション
		containerEl.createEl("h3", {
			text: "🤖 AI設定",
			attr: { style: "margin-top: 30px;" },
		});
		containerEl.createEl("p", {
			text: "使用するAIプロバイダーとモデルを設定します",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("プロバイダー")
			.setDesc("使用するAIプロバイダーを選択")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("openai", "OpenAI")
					.addOption("claude", "Claude (Anthropic)")
					.addOption("groq", "Groq")
					.setValue(this.plugin.settings.provider)
					.onChange(async (value) => {
						this.plugin.settings.provider = value;
						await this.plugin.saveSettings();
						await this.display(); // 設定画面を再描画
					})
			);

		new Setting(containerEl)
			.setName("モデル")
			.setDesc("使用するAIモデルを選択")
			.addDropdown((dropdown) => {
				const providerKey = this.plugin.settings.provider as
					| "openai"
					| "groq"
					| "claude";
				const allModels = modelsData[providerKey] || [];

				// すべてのモデルを追加
				allModels.forEach((model: any) => {
					dropdown.addOption(model.id, model.name);
				});

				// フォールバック: models.jsonがない場合のデフォルトモデル
				if (allModels.length === 0) {
					if (this.plugin.settings.provider === "openai") {
						dropdown.addOption("gpt-4o", "gpt-4o");
					} else if (this.plugin.settings.provider === "claude") {
						dropdown.addOption(
							"claude-3-5-sonnet-latest",
							"claude-3-5-sonnet"
						);
					} else if (this.plugin.settings.provider === "groq") {
						dropdown.addOption(
							"llama-3.3-70b-versatile",
							"llama-3.3-70b"
						);
					}
				}

				dropdown
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
					});
			});

		// API Key設定セクション
		containerEl.createEl("h3", {
			text: "🔑 API Key設定",
			attr: { style: "margin-top: 30px;" },
		});
		containerEl.createEl("p", {
			text: "各プロバイダーのAPIキーを設定します（選択したプロバイダーのキーが必要です）",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("OpenAI API Key")
			.setDesc("OpenAI APIのキー")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.openaiApiKey)
					.onChange(async (value) => {
						this.plugin.settings.openaiApiKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Claude API Key")
			.setDesc("Anthropic Claude APIのキー")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("sk-ant-...")
					.setValue(this.plugin.settings.claudeApiKey)
					.onChange(async (value) => {
						this.plugin.settings.claudeApiKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Groq API Key")
			.setDesc("Groq APIのキー")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("gsk_...")
					.setValue(this.plugin.settings.groqApiKey)
					.onChange(async (value) => {
						this.plugin.settings.groqApiKey = value;
						await this.plugin.saveSettings();
					});
			});
	}
}

export default class MyPlugin extends Plugin {
	settings: BrainstallSettings;

	async onload() {
		// 設定を読み込み
		await this.loadSettings();

		// カスタムビューを登録
		this.registerView(VIEW_TYPE, (leaf) => new BrainstallView(leaf, this));

		// リボンアイコン（右サイドバー）
		this.addRibbonIcon("brain", "Brainstall", () => {
			this.openBrainstallPanel();
		});

		// コマンド: Brainstallを開く
		this.addCommand({
			id: "open-brainstall",
			name: "Brainstall を開く",
			callback: () => {
				this.openBrainstallPanel();
			},
		});

		// 設定タブを追加
		this.addSettingTab(new BrainstallSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async openBrainstallPanel() {
		// 既に開いているかチェック
		const existingLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
		if (existingLeaves.length > 0) {
			// 既に開いている場合は何もしない
			return;
		}

		let leaf: WorkspaceLeaf | null;

		if (Platform.isMobile) {
			// モバイル: タブページ（メインエディタエリア）として開く
			leaf = this.app.workspace.getLeaf(false);
		} else {
			// PC: 右サイドパネルとして開く
			leaf = this.app.workspace.getRightLeaf(false);
		}

		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	private formatTimestamp(format: string, date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		const seconds = String(date.getSeconds()).padStart(2, "0");

		if (format === "ISO") {
			return date.toISOString().replace(/[:.]/g, "-").slice(0, -5);
		} else if (format === "Unix") {
			return String(Math.floor(date.getTime() / 1000));
		} else {
			// カスタムフォーマット
			return format
				.replace(/YYYY/g, String(year))
				.replace(/MM/g, month)
				.replace(/DD/g, day)
				.replace(/HH/g, hours)
				.replace(/mm/g, minutes)
				.replace(/ss/g, seconds);
		}
	}

	// JST時刻をISO形式で返す関数
	private toJSTISOString(date: Date): string {
		// ローカル時刻を取得してJSTとして扱う
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		const seconds = String(date.getSeconds()).padStart(2, "0");
		const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
		return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}+09:00`;
	}

	// 年/年月/年月日の階層構造でフォルダパスを生成する関数
	private getDateFolderPath(baseFolder: string, date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const yearMonth = `${year}-${month}`;
		const yearMonthDay = `${year}-${month}-${day}`;
		return `${baseFolder}/${year}/${yearMonth}/${yearMonthDay}`;
	}

	// 階層フォルダを確実に作成する関数
	private async ensureFolderExists(folderPath: string) {
		if (!(await this.app.vault.adapter.exists(folderPath))) {
			// 階層的にフォルダを作成
			const parts = folderPath.split("/");
			let currentPath = "";
			for (const part of parts) {
				if (part === "") continue;
				currentPath = currentPath ? `${currentPath}/${part}` : part;
				if (!(await this.app.vault.adapter.exists(currentPath))) {
					await this.app.vault.createFolder(currentPath);
				}
			}
		}
	}

	// wikilinkを抽出して配列として返す（存在するもののみ）
	private extractWikilinks(text: string): string[] {
		const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
		const matches = Array.from(text.matchAll(wikilinkRegex));
		const validLinks: string[] = [];

		for (const match of matches) {
			const linkText = match[1];
			// パイプ記法の場合はファイル名部分を使用
			const parts = linkText.split("|");
			const fileName =
				parts.length > 1 ? parts[parts.length - 1] : linkText;

			// ファイルが存在するかチェック
			const file = this.app.vault
				.getMarkdownFiles()
				.find((f) => f.basename === fileName || f.name === fileName);

			if (file) {
				validLinks.push(`[[${fileName}]]`);
			}
		}

		return validLinks;
	}

	// contextから使用できない記号を削除
	private sanitizeContext(text: string): string {
		return text
			.replace(/[\/\\?%*:|"<>#\[\]]/g, "")
			.replace(/\n+/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	}

	async createNewPost(
		content: string,
		sourceFile: TFile | null = null
	): Promise<string | null> {
		// タイムスタンプを生成（例：20250329/20250329_080200.md）
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		const hours = String(now.getHours()).padStart(2, "0");
		const minutes = String(now.getMinutes()).padStart(2, "0");
		const seconds = String(now.getSeconds()).padStart(2, "0");

		const timestamp = this.formatTimestamp(
			this.settings.timestampFormat,
			now
		);

		// contextを最初の行から抽出（wikilinkの括弧を削除）
		const firstLine = content.split("\n")[0] || "";
		const cleanFirstLine = firstLine.replace(
			/\[\[([^\]]+)\]\]/g,
			(match, linkText) => {
				// パイプ記法の場合は表示名を使用、そうでなければファイル名を使用
				const parts = linkText.split("|");
				return parts.length > 1 ? parts[0] : linkText;
			}
		);

		// ファイル名に使用するため、タイトルに使用できない記号やスペースを削除
		const safeContext = cleanFirstLine
			.replace(/[\/\\?%*:|"<>]/g, "_")
			.replace(/\s+/g, "_")
			.trim();
		const fileName = `${timestamp}_memo_${safeContext}.md`;

		// 日付ごとのフォルダを作成（設定から取得）
		const baseFolder =
			this.settings.notificationFolder || "Archives/Notifications";
		const folderPath = this.getDateFolderPath(baseFolder, now);

		try {
			// フォルダが存在しない場合は作成
			await this.ensureFolderExists(folderPath);

			// ファイルを作成（内容を保存）
			const filePath = `${folderPath}/${fileName}`;

			// 一行目からcontextを作成（記号などを削除）
			const firstLine = content.split("\n")[0] || "";
			const contextLine = this.sanitizeContext(
				firstLine.replace(/\[\[([^\]]+)\]\]/g, (match, linkText) => {
					// パイプ記法の場合は表示名を使用、そうでなければファイル名を使用
					const parts = linkText.split("|");
					return parts.length > 1 ? parts[0] : linkText;
				})
			);

			let frontmatter = `---
type: memo`;

			// contextを追加
			if (contextLine) {
				frontmatter += `\ncontext: "${contextLine}"`;
			}

			frontmatter += `\ncreated: "${this.toJSTISOString(now)}"`;

			// wikilinkを抽出（content内とsourceFileから、存在するもののみ）
			const wikilinks = [...this.extractWikilinks(content)];
			if (sourceFile) {
				const fileExists = this.app.vault
					.getMarkdownFiles()
					.some((f) => f.path === sourceFile.path);
				if (fileExists) {
					wikilinks.push(`[[${sourceFile.basename}]]`);
				}
			}

			// 重複を除去
			const uniqueWikilinks = Array.from(new Set(wikilinks));

			// linksがある場合は追加（YAML配列形式）
			if (uniqueWikilinks.length > 0) {
				frontmatter += `\nlinks:`;
				for (const link of uniqueWikilinks) {
					frontmatter += `\n  - "${link}"`;
				}
			}

			frontmatter += `\n---

${content}`;

			await this.app.vault.create(filePath, frontmatter);

			return filePath;
		} catch (error) {
			new Notice(`エラー: ${error}`);
			return null;
		}
	}

	onunload() {
		// クリーンアップ（必要に応じて）
	}
}
