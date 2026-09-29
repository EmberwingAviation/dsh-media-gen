window.__ModuleLoader__.load({
	id: "dsh-media-gen-video",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");

		//#region shared
		const VIDEO_ROUTE = "/plugins/dsh-video-gen/video";
		const VIDEO_GENERATION_NAMESPACE = "video-generation";
		const VIDEO_PROVIDERS = ["dashscope", "volcengine", "openai", "google"];
		const DEFAULT_DASHSCOPE_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1";
		const DEFAULT_VOLCENGINE_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
		const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
		const DEFAULT_GOOGLE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
		const DEFAULT_DASHSCOPE_MODEL = "wanx2.1-t2v-turbo";
		const DEFAULT_VOLCENGINE_MODEL = "doubao-seedance-1-0-pro-250528";
		const DEFAULT_OPENAI_MODEL = "sora-2";
		const DEFAULT_GOOGLE_MODEL = "veo-3.0-generate-preview";
		const DEFAULT_WORKSPACE_FOLDER = "dsh-video-gen";

		const KEY_REF = {
			dashscope: "DASHSCOPE_API_KEY",
			volcengine: "ARK_API_KEY",
			openai: "OPENAI_API_KEY",
			google: "GEMINI_API_KEY",
		};

		const DEFAULT_BASE_URLS = {
			dashscope: DEFAULT_DASHSCOPE_ENDPOINT,
			volcengine: DEFAULT_VOLCENGINE_BASE_URL,
			openai: DEFAULT_OPENAI_BASE_URL,
			google: DEFAULT_GOOGLE_ENDPOINT,
		};

		const DEFAULT_MODELS = {
			dashscope: DEFAULT_DASHSCOPE_MODEL,
			volcengine: DEFAULT_VOLCENGINE_MODEL,
			openai: DEFAULT_OPENAI_MODEL,
			google: DEFAULT_GOOGLE_MODEL,
		};

		const DICT = {
			zh: {
				title: "视频生成",
				description: "使用通义万相、豆包 Seedance、Google Veo 或 Sora 生成短视频",
				provider: "提供商",
				providerDashScope: "阿里云 DashScope (通义万相)",
				providerVolcengine: "火山引擎 / 豆包 Seedance",
				providerOpenAI: "OpenAI Sora / 中转站",
				providerGoogle: "Google Veo (Gemini)",
				model: "模型",
				endpoint: "端点 / Base URL",
				apiKey: "API Key",
				apiKeyPlaceholder: "粘贴新密钥以更新...",
				keyConfigured: "✓ 已配置",
				keyNotConfigured: "✗ 未配置",
				checkingKey: "检查中...",
				saveToWorkspace: "保存视频到工作区",
				workspaceFolder: "工作区子文件夹",
				pollInterval: "轮询间隔 (ms)",
				waitTimeout: "等待超时 (ms)",
				save: "保存设置",
				saving: "保存中...",
				saved: "✓ 已保存",
				generatedTitle: "生成的视频",
				animatedTitle: "图生视频",
				loading: "加载中...",
				loadFailed: "视频加载失败 ({status})",
				savedToPath: "保存位置",
				generating: "正在生成视频，请稍候...",
				animating: "正在从图片生成视频，请稍候...",
				openNewTab: "新标签页打开",
				reset: "重置",
				resetTitle: "重置为默认官方地址",
				// Gallery
				galleryTab: "视频画廊",
				galleryTotalCount: "共 {count} 个生成视频",
				gallerySearchPlaceholder: "搜索 Prompt 关键词…",
				galleryFilterAll: "全部厂商",
				galleryEmptyTitle: "暂无视频生成记录",
				galleryEmptyDesc: "在对话中让 Agent 生成视频后，生成的视频会自动收录到这里。",
				galleryNoMatchTitle: "未找到匹配结果",
				galleryNoMatchDesc: "尝试更换搜索关键词或选择其他厂商。",
				copiedPrompt: "已复制 Prompt",
				copyFailed: "复制失败",
				preview: "预览播放",
				download: "下载视频",
				copyPpt: "复制 Prompt",
				galleryDelete: "从画廊删除",
				galleryConfirmDelete: "确定要从画廊中删除这个视频吗？（不会影响原聊天记录）",
				galleryDeleted: "已从画廊删除",
				galleryI2v: "图生视频",
				galleryUnavailable: "视频暂不可用（缓存已被清理或文件已被移动）",
				// Media catalog (dsh-media-gen)
				vCardTitle: "视频生成",
				vCardDesc: "多供应商目录：通义万相 / 火山 Seedance / Google Veo / Sora 风格中转（含图生视频）",
				vEnabled: "启用视频工具",
				vCatalog: "供应商目录",
				vCatalogEmpty: "尚未添加视频供应商，点击下方“添加供应商”。",
				vAdd: "添加供应商",
				vEdit: "编辑",
				vDelete: "删除",
				vMakeDefault: "设为默认",
				vDefaultBadge: "默认",
				vName: "名称",
				vId: "ID",
				vKind: "类型",
				vKindDashscope: "阿里 DashScope（通义万相）",
				vKindVolcengine: "火山引擎 Ark（豆包 Seedance）",
				vKindGoogle: "Google Veo",
				vKindOpenai: "OpenAI 兼容 / Sora 风格中转",
				vModel: "模型",
				vFetchModels: "拉取上游模型",
				vBaseUrl: "Base URL（留空用默认）",
				vKeyEnv: "Key 环境变量（凭据引用）",
				vI2v: "支持图生视频 (i2v)",
				vI2vHint: "中转需显式勾选（经 input_reference 传图）",
				vConfirm: "确定",
				vCancel: "取消",
				vNeedFields: "名称与模型为必填",
				vDupId: "该 ID 已存在",
				vConfirmDelete: "确定删除供应商 {name} ？",
				close: "关闭 (Esc)",
			},
			en: {
				title: "Video Generation",
				description: "Generate videos with Wanx, Doubao Seedance, Google Veo, or Sora",
				provider: "Provider",
				providerDashScope: "Aliyun DashScope (Wanx)",
				providerVolcengine: "Volcengine / Doubao Seedance",
				providerOpenAI: "OpenAI Sora / Relay",
				providerGoogle: "Google Veo (Gemini)",
				model: "Model",
				endpoint: "Endpoint / Base URL",
				apiKey: "API Key",
				apiKeyPlaceholder: "Paste a new key to update...",
				keyConfigured: "✓ Configured",
				keyNotConfigured: "✗ Not configured",
				checkingKey: "Checking...",
				saveToWorkspace: "Save videos to workspace",
				workspaceFolder: "Workspace subfolder",
				pollInterval: "Poll interval (ms)",
				waitTimeout: "Wait timeout (ms)",
				save: "Save Settings",
				saving: "Saving...",
				saved: "✓ Saved",
				generatedTitle: "Generated Video",
				animatedTitle: "Image-to-Video",
				loading: "Loading...",
				loadFailed: "Video loading failed ({status})",
				savedToPath: "Saved to",
				generating: "Generating video, please wait...",
				animating: "Animating image into video, please wait...",
				openNewTab: "Open in new tab",
				reset: "Reset",
				resetTitle: "Reset to official default URL",
				// Gallery
				galleryTab: "Video Gallery",
				galleryTotalCount: "{count} videos total",
				gallerySearchPlaceholder: "Search prompt keywords…",
				galleryFilterAll: "All Providers",
				galleryEmptyTitle: "No videos generated yet",
				galleryEmptyDesc: "Videos generated during conversations will automatically appear here.",
				galleryNoMatchTitle: "No matching videos",
				galleryNoMatchDesc: "Try a different search keyword or provider filter.",
				copiedPrompt: "Prompt copied",
				copyFailed: "Copy failed",
				preview: "Preview",
				download: "Download",
				copyPpt: "Copy Prompt",
				galleryDelete: "Delete from gallery",
				galleryConfirmDelete: "Are you sure you want to remove this video from the gallery? (Chat history will not be affected)",
				galleryDeleted: "Deleted from gallery",
				galleryI2v: "Image-to-Video",
				galleryUnavailable: "Video unavailable (cache evicted or file moved)",
				// Media catalog (dsh-media-gen)
				vCardTitle: "Video Generation",
				vCardDesc: "Multi-provider catalog: Wanx / Seedance / Google Veo / Sora-style relays (incl. image-to-video)",
				vEnabled: "Enable video tools",
				vCatalog: "Provider catalog",
				vCatalogEmpty: "No video providers yet — click “Add provider” below.",
				vAdd: "Add provider",
				vEdit: "Edit",
				vDelete: "Delete",
				vMakeDefault: "Make default",
				vDefaultBadge: "default",
				vName: "Name",
				vId: "ID",
				vKind: "Kind",
				vKindDashscope: "Aliyun DashScope (Wanx)",
				vKindVolcengine: "Volcengine Ark (Doubao Seedance)",
				vKindGoogle: "Google Veo",
				vKindOpenai: "OpenAI-compatible / Sora-style relay",
				vModel: "Model",
				vFetchModels: "Fetch upstream models",
				vBaseUrl: "Base URL (empty = default)",
				vKeyEnv: "Key env name (credential ref)",
				vI2v: "Supports image-to-video (i2v)",
				vI2vHint: "relays need this checked explicitly (image sent via input_reference)",
				vConfirm: "Confirm",
				vCancel: "Cancel",
				vNeedFields: "Name and model are required",
				vDupId: "This ID already exists",
				vConfirmDelete: "Delete provider {name} ?",
				close: "Close (Esc)",
			}
		};

				function slugId(name) {
			return String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "provider";
		}

		const KIND_DEFAULTS = {
			dashscope: { baseUrl: DEFAULT_DASHSCOPE_ENDPOINT, apiKeyEnv: KEY_REF.dashscope, i2v: true },
			volcengine: { baseUrl: DEFAULT_VOLCENGINE_BASE_URL, apiKeyEnv: KEY_REF.volcengine, i2v: true },
			google: { baseUrl: DEFAULT_GOOGLE_ENDPOINT, apiKeyEnv: KEY_REF.google, i2v: true },
			"openai-compatible": { baseUrl: DEFAULT_OPENAI_BASE_URL, apiKeyEnv: KEY_REF.openai, i2v: false },
		};
		const KIND_ORDER = ["openai-compatible", "dashscope", "volcengine", "google"];
		const KIND_LABEL_KEY = {
			dashscope: "vKindDashscope",
			volcengine: "vKindVolcengine",
			google: "vKindGoogle",
			"openai-compatible": "vKindOpenai",
		};

		/** 合并 loader 条目 id（host lib/media-config.js 的 Config 挂在它上面）。 */
		const MEDIA_ENTRY_ID = "media-gen";

		/** 视频字段投影（与 host lib/media-config.js pickVideoSettings 同构）。 */
		function pickVideoSettings(value) {
			return {
				videoEnabled: value?.videoEnabled !== false,
				videoProviders: Array.isArray(value?.videoProviders) ? value.videoProviders : [],
				videoProviderId: value?.videoProviderId ?? "",
				pollIntervalMs: value?.pollIntervalMs ?? 5000,
				waitTimeoutMs: value?.waitTimeoutMs ?? 600000,
				saveToWorkspace: value?.saveToWorkspace !== false,
				videoFolder: value?.videoFolder ?? "generate/video",
			};
		}

		/**
		 * DSH >= 0.1.6：settingsScope 已移除，设置面走合并条目的 configForms。
		 * 适配成上游卡片使用的 scope 形状（getSnapshot/subscribe/set/mutate）。
		 */
		function bindVideoScope(ctx) {
			const configForms = ctx.get("configForms");
			const form = configForms && typeof configForms.get === "function" ? configForms.get(MEDIA_ENTRY_ID) : undefined;
			if (form === undefined) {
				return {
					getSnapshot: () => ({ status: "unavailable", value: undefined, writable: false, revision: undefined }),
					subscribe: () => () => {},
					set: () => Promise.resolve(false),
					mutate: () => Promise.resolve(false),
				};
			}
			return {
				getSnapshot() {
					const snap = form.getSnapshot();
					return {
						status: snap.status,
						value: snap.value === undefined ? undefined : pickVideoSettings(snap.value),
						writable: snap.writable,
						revision: snap.revision,
					};
				},
				subscribe: (callback) => form.subscribe(callback),
				set(key, value) { return form.mutate([{ op: "set", path: [key], value }]); },
				mutate(ops, expectedRevision) { return form.mutate(ops, expectedRevision); },
			};
		}

		/** 经 host loopback RPC 调 GET {baseUrl}/models（凭据在服务端解析），填充模型候选 datalist。 */
		function fetchVideoModels(props, draft, setChoices) {
			const rpc = props.rpc;
			if (!rpc || typeof rpc.call !== "function") {
				window.alert("RPC unavailable");
				return Promise.resolve();
			}
			const kind = KIND_ORDER.includes(draft.kind) ? draft.kind : "openai-compatible";
			return rpc.call("/image-gen", "models", {
				baseUrl: String(draft.baseUrl ?? "").trim() || KIND_DEFAULTS[kind].baseUrl,
				apiKeyEnv: String(draft.apiKeyEnv ?? "").trim() || KIND_DEFAULTS[kind].apiKeyEnv,
			}).then((result) => {
				if (!result.ok) throw new Error(result.error?.message ?? "fetch failed");
				const ids = Array.isArray(result.value?.ids) ? result.value.ids : [];
				if (ids.length === 0) { window.alert("upstream returned no models"); return; }
				setChoices(ids);
			}).catch((cause) => { window.alert(cause instanceof Error ? cause.message : String(cause)); });
		}

		/** plugins.bundle.config 页面（DSH >= 0.1.6）：视频设置卡与生图选择卡并列。 */
		function VideoSettingsPage(props) {
			if (props.view === "summary") return null;
			return react.createElement("ul", { style: { listStyle: "none", margin: 0, padding: 0 } },
				react.createElement(VideoGenerationSettingsCard, props));
		}

		//#endregion

		//#region styles
		const STYLE = `
/* Settings Card — matches dsh-image-gen design tokens */
.dsh-vg-card{list-style:none;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;background:var(--dsw-alias-bg-layer-3,#fff);transition:border-color .16s,background .16s;overflow:hidden;margin-bottom:10px}
.dsh-vg-card:hover{border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-vg-card-open{background:var(--dsw-alias-bg-layer-2,#fff);border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-vg-head{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:12px}
.dsh-vg-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c78ff);outline-offset:-2px}
.dsh-vg-head-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.dsh-vg-title{display:block;font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary,inherit)}
.dsh-vg-desc{display:block;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#7b818b)}
.dsh-vg-chevron{flex:none;color:var(--dsw-alias-label-tertiary,#7b818b);transition:transform .16s;display:inline-flex;align-items:center}
.dsh-vg-chevron-open{transform:rotate(180deg)}
.dsh-vg-body{border-top:1px solid var(--dsw-alias-border-l2,#eee);padding:0 16px 16px}
.dsh-vg-field{display:grid;gap:6px;margin-top:14px}
.dsh-vg-label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,inherit)}
.dsh-vg-input,.dsh-vg-select{box-sizing:border-box;width:100%;padding:8px 12px;font-size:13px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-3,transparent);color:inherit;outline:none;transition:border-color .15s}
.dsh-vg-input:focus,.dsh-vg-select:focus{border-color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-vg-hint,.dsh-vg-status{margin:0;color:var(--dsw-alias-label-tertiary,#7b818b);font-size:12px;line-height:1.4}
.dsh-vg-checkbox-row{display:flex;align-items:center;gap:8px;cursor:pointer}
.dsh-vg-checkbox-row input[type=checkbox]{width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary,#4c78ff);margin:0}
.dsh-vg-checkbox-row label{font-size:13px;color:var(--dsw-alias-label-primary,inherit);cursor:pointer}
.dsh-vg-input-group{display:flex;gap:8px;align-items:center}
.dsh-vg-btn-reset{appearance:none;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;padding:7px 12px;background:var(--dsw-alias-bg-layer-3,#f9fafb);color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s}
.dsh-vg-btn-reset:hover{background:var(--dsw-alias-bg-layer-2,#edf0f3);border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-vg-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,#eee)}
.dsh-vg-save{appearance:none;border:0;border-radius:8px;padding:6px 16px;background:var(--dsw-alias-label-primary,#111827);color:var(--dsw-alias-bg-layer-3,#fff);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:opacity .15s}
.dsh-vg-save:disabled{opacity:.4;cursor:default}

/* Result card */
.dsh-vg-result{display:grid;gap:10px;max-width:520px}
.dsh-vg-result-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,inherit)}
.dsh-vg-savedto{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#7b818b);word-break:break-all}
.dsh-vg-error{color:var(--dsw-alias-label-error,#d33);font-size:13px}
.dsh-vg-loading{color:var(--dsw-alias-label-tertiary,#7b818b);font-size:13px}
.dsh-vg-container{margin-top:8px;position:relative}
.dsh-vg-video{width:100%;max-width:640px;border-radius:8px;background:#000}
.dsh-vg-toolbar{position:absolute;top:8px;left:8px;display:flex;align-items:center;gap:5px;padding:3px 5px;border-radius:8px;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:10;line-height:1}
.dsh-vg-container:hover .dsh-vg-toolbar{opacity:1;pointer-events:auto}
.dsh-vg-tool-btn{appearance:none;border:0;background:transparent;color:#fff;padding:5px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s,color .15s}
.dsh-vg-tool-btn:hover{background:rgba(255,255,255,0.25)}
.dsh-vg-toast{position:absolute;top:100%;left:0;margin-top:5px;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,0.85);color:#fff;font-size:11px;white-space:nowrap;pointer-events:none;z-index:20}

/* Gallery — matches dsh-image-gen design tokens */
.dsh-vg-gallery-page{width:100%;height:100%;background:var(--dsw-alias-bg-layer-1,#fff);display:flex;flex-direction:column;overflow:hidden;flex:1}
.dsh-vg-gallery-page-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 28px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fff);flex-shrink:0}
.dsh-vg-gallery-page-title-row{display:flex;align-items:center;gap:12px}
.dsh-vg-gallery-page-count{font-size:13px;font-weight:500;color:var(--dsw-alias-label-secondary,#4b5563);background:var(--dsw-alias-bg-layer-3,#f3f4f6);padding:3px 10px;border-radius:20px}
.dsh-vg-gallery-page-tools{display:flex;align-items:center;gap:12px}
.dsh-vg-gallery-search-wrap{position:relative;display:flex;align-items:center}
.dsh-vg-gallery-search-icon{position:absolute;left:10px;color:var(--dsw-alias-label-tertiary,#9ca3af);pointer-events:none}
.dsh-vg-gallery-search-input{padding:6px 12px 6px 32px;font-size:13px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#fff);color:inherit;outline:none;width:200px;transition:border-color .15s,width .2s}
.dsh-vg-gallery-search-input:focus{border-color:var(--dsw-alias-brand-primary,#4c78ff);width:240px}
.dsh-vg-gallery-select{padding:6px 12px;font-size:13px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#fff);color:inherit;outline:none;cursor:pointer}
.dsh-vg-gallery-page-body{flex:1;overflow-y:auto;padding:24px 28px}
.dsh-vg-gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px}
.dsh-vg-gallery-card{background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
.dsh-vg-gallery-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.06);border-color:var(--dsw-alias-border-l1,#cfd4dc)}
.dsh-vg-gallery-card-media{position:relative;width:100%;aspect-ratio:16/9;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center}
.dsh-vg-gallery-card-video{width:100%;height:100%;object-fit:cover}
.dsh-vg-gallery-card-loading{font-size:12px;color:var(--dsw-alias-label-tertiary,#9ca3af)}
.dsh-vg-gallery-card-error{font-size:12px;color:#fca5a5;padding:8px;text-align:center;word-break:break-word}
.dsh-vg-gallery-card-meta{padding:12px 14px;display:flex;flex-direction:column;gap:6px;background:var(--dsw-alias-bg-layer-2,#fff);flex:1}
.dsh-vg-gallery-card-header{display:flex;align-items:center;justify-content:space-between;font-size:11px}
.dsh-vg-tag{display:inline-block;padding:2px 6px;border-radius:4px;background:var(--dsw-alias-bg-layer-3,#edf0f3);color:var(--dsw-alias-label-secondary,inherit);font-weight:500;text-transform:uppercase;font-size:10px}
.dsh-vg-tag-model{background:rgba(76,120,255,0.1);color:#4c78ff}
.dsh-vg-tag-i2v{background:rgba(16,185,129,0.12);color:#10b981}
.dsh-vg-gallery-card-prompt{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary,inherit);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.dsh-vg-gallery-card-sub{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:11px;color:var(--dsw-alias-label-tertiary,#7b818b)}
.dsh-vg-card-toolbar{position:absolute;top:8px;left:8px;display:flex;align-items:center;gap:5px;padding:3px 5px;border-radius:8px;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:10;line-height:1}
.dsh-vg-gallery-card:hover .dsh-vg-card-toolbar{opacity:1;pointer-events:auto}
.dsh-vg-tool-btn-danger:hover{background:rgba(239,68,68,0.75)!important;color:#fff!important}
.dsh-vg-gallery-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:360px;text-align:center;color:var(--dsw-alias-label-tertiary,#7b818b)}
.dsh-vg-gallery-empty-icon{font-size:48px;margin-bottom:12px}
.dsh-vg-gallery-empty-title{font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);margin-bottom:6px}
.dsh-vg-gallery-empty-desc{font-size:13px;max-width:360px;line-height:1.5}

/* Lightbox */
.dsh-vg-lightbox-backdrop{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;cursor:zoom-out;animation:dsh-vg-fade .15s ease-out}
@keyframes dsh-vg-fade{from{opacity:0}to{opacity:1}}
.dsh-vg-lightbox-topbar{position:absolute;top:20px;left:24px;right:24px;display:flex;align-items:center;justify-content:space-between;z-index:10;pointer-events:none}
.dsh-vg-lightbox-meta{display:flex;align-items:center;gap:8px;pointer-events:auto}
.dsh-vg-lightbox-close-btn{appearance:none;border:0;background:rgba(255,255,255,0.15);color:#fff;border-radius:50%;width:34px;height:34px;font-size:16px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s;pointer-events:auto}
.dsh-vg-lightbox-close-btn:hover{background:rgba(255,255,255,0.3)}
.dsh-vg-lightbox-video-wrap{max-width:86vw;max-height:78vh;display:flex;align-items:center;justify-content:center;cursor:default}
.dsh-vg-lightbox-video{max-width:100%;max-height:78vh;border-radius:8px;box-shadow:0 24px 60px rgba(0,0,0,0.7)}
.dsh-vg-lightbox-bottombar{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);max-width:min(90vw,640px);background:rgba(20,22,26,0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:10px 16px;display:flex;flex-direction:column;gap:8px;color:#fff;box-shadow:0 16px 40px rgba(0,0,0,0.5);cursor:default}
.dsh-vg-lightbox-prompt-text{font-size:13px;line-height:1.4;color:rgba(255,255,255,0.92);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.dsh-vg-lightbox-savedto{font-size:11px;line-height:1.4;color:rgba(255,255,255,0.55);word-break:break-all}
.dsh-vg-lightbox-actions{display:flex;align-items:center;gap:8px;justify-content:flex-end;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px}
.dsh-vg-lightbox-btn{appearance:none;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:#fff;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:background .15s,border-color .15s,color .15s}
.dsh-vg-lightbox-btn:hover{background:rgba(255,255,255,0.22)}
.dsh-vg-lightbox-btn-danger{border-color:rgba(239,68,68,0.4);color:#fca5a5}
.dsh-vg-lightbox-btn-danger:hover{background:rgba(239,68,68,0.35)!important;color:#fff!important;border-color:rgba(239,68,68,0.7)!important}
.dsh-vg-gallery-page-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:6px 14px;border-radius:8px;font-size:13px;z-index:99999;animation:dsh-vg-fade .15s}
`;
		//#endregion

		//#region client apply + settings card
		// `remote` is declared because cordis refuses to read a service a plugin
		// never injected ("cannot get property ... without inject"); both the 0.1.1
		// and 0.1.5 compositions provide it.
		const inject = ["slots", "connection", "locale", "remote"];

		/**
		 * The credential face the settings card talks to, normalised across dsh
		 * generations: 0.1.5 exposes `ctx.remote.credentials` with positional
		 * arguments (`describe([ref])`, `set(ref, value)`), older builds hang it off
		 * `connection.api.credentials` with object arguments (`describe({refs})`,
		 * `set({ref, value})`). Both become `describe(ref) -> {ok, configured}` and
		 * `set(ref, value)`, which throws on failure.
		 * @param ctx - the client plugin context.
		 * @returns the normalised credential face (never null).
		 */
		function credentialFace(ctx) {
			// Defensive read: a build whose `remote` shape differs must degrade to the
			// legacy face below, not fail the whole client plugin.
			let remoteCredentials;
			try {
				remoteCredentials = ctx.remote?.credentials;
			} catch {
				remoteCredentials = undefined;
			}
			if (remoteCredentials !== undefined) {
				return {
					describe: async (ref) => {
						const response = await remoteCredentials.describe([ref]);
						const view = response?.ok === true ? response.value?.[ref] : undefined;
						return { ok: response?.ok === true, configured: view?.configured === true };
					},
					set: async (ref, value) => {
						const response = await remoteCredentials.set(ref, value);
						if (response?.ok === false) throw new Error(response.error?.message ?? "credential write failed");
					},
				};
			}
			const api = ctx.get("connection")?.api;
			if (api?.credentials !== undefined) {
				return {
					describe: async (ref) => {
						const result = (await api.credentials.describe({ refs: [ref] }))?.result;
						const view = result?.ok === true ? result.value?.credentials?.[ref] : undefined;
						return { ok: result?.ok === true, configured: view?.configured === true };
					},
					set: async (ref, value) => {
						const result = (await api.credentials.set({ ref, value }))?.result;
						if (result?.ok === false) throw new Error(result.error?.message ?? "credential write failed");
					},
				};
			}
			return {
				describe: async () => ({ ok: false, configured: false }),
				set: async () => { throw new Error("credentials are unavailable in this dsh build"); },
			};
		}

				function apply(ctx) {
			const credentials = credentialFace(ctx);
			const scope = bindVideoScope(ctx);
			const locale = ctx.get("locale");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.plugin = "dsh-media-gen";
				style.textContent = STYLE;
				document.head.appendChild(style);
				return () => { style.remove(); };
			}, "dsh-media-gen: video styles");

			const register = ctx.slots.register.bind(ctx.slots);
			// 独立导航页（不依赖 plugins.bundle.config 的 keyed 渲染与 whileServed 门控）
			ctx.slots.inject("settings.section", () => register({
				name: "settings.section",
				id: "media-video-gen",
				order: 87,
				label: () => {
					const active = locale?.getSnapshot?.()?.active;
					return active?.startsWith("en") ? "Video generation" : "视频生成";
				},
				inject: () => ({ scope, credentials, locale, rpc: ctx.get("connection")?.rpc })
			}, VideoSettingsPage));

			ctx.slots.inject("tool.call.toolview", () => register({
				name: "tool.call.toolview",
				key: "generate_video",
				inject: () => ({ locale })
			}, GeneratedVideoCard));

			ctx.slots.inject("tool.call.toolview", () => register({
				name: "tool.call.toolview",
				key: "animate_image",
				inject: () => ({ locale })
			}, GeneratedVideoCard));

			// Gallery view tab
			ctx.slots.inject("conversation.view", () => register({
				name: "conversation.view",
				id: "video-gallery",
				order: 30,
				label: () => {
					const active = locale?.getSnapshot?.()?.active;
					return active?.startsWith("en") ? "Video Gallery" : "视频画廊";
				},
				inject: () => ({ locale }),
			}, GalleryViewTab));
		}

				function VideoGenerationSettingsCard(props) {
			const h = react.createElement;
			const [open, setOpen] = react.useState(false);
			const [snapshot, setSnapshot] = react.useState(() => props.scope.getSnapshot());
			const [lang, setLang] = react.useState(() => props.locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh");
			const [message, setMessage] = react.useState("");
			const [saving, setSaving] = react.useState(false);
			const [form, setForm] = react.useState(() => pickVideoSettings(snapshot.value));
			const [draft, setDraft] = react.useState(null);
			const [keyInput, setKeyInput] = react.useState("");
			const [modelChoices, setModelChoices] = react.useState([]);
			const [keyStatus, setKeyStatus] = react.useState({});

			react.useEffect(() => props.scope.subscribe(() => setSnapshot(props.scope.getSnapshot())), [props.scope]);
			react.useEffect(() => { setForm(pickVideoSettings(snapshot.value)); }, [snapshot]);
			react.useEffect(() => props.locale?.subscribe?.(() => {
				setLang(props.locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh");
			}), [props.locale]);

			const t = (keyName, params) => {
				let text = (lang === "en" ? DICT.en : DICT.zh)[keyName] || DICT.zh[keyName] || keyName;
				if (params) for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, v);
				return text;
			};

			// 目录里出现过的每个凭据引用，查询其配置状态（只报告 configured 布尔，不读取值）。
			react.useEffect(() => {
				let active = true;
				const envs = [...new Set((snapshot.value?.videoProviders ?? []).map((row) => row?.apiKeyEnv).filter(Boolean))];
				if (envs.length === 0) { setKeyStatus({}); return undefined; }
				Promise.all(envs.map((ref) => props.credentials.describe(ref)
					.then((view) => [ref, view.ok ? view.configured : undefined])
					.catch(() => [ref, undefined])))
					.then((rows) => { if (active) setKeyStatus(Object.fromEntries(rows)); });
				return () => { active = false; };
			}, [props.credentials, snapshot]);

			const patchForm = (changes) => setForm((prev) => ({ ...prev, ...changes }));

			const startAdd = () => {
				setDraft({
					isNew: true, originalId: undefined, id: "", name: "",
					kind: "openai-compatible", baseUrl: "", model: "",
					apiKeyEnv: KIND_DEFAULTS["openai-compatible"].apiKeyEnv, i2v: false,
				});
				setKeyInput("");
				setMessage("");
			};

			const startEdit = (entry) => {
				setDraft({ ...entry, isNew: false, originalId: entry.id, i2v: entry.i2v === true });
				setKeyInput("");
				setMessage("");
			};

			const patchDraft = (changes) => setDraft((prev) => ({ ...prev, ...changes }));

			const confirmDraft = async () => {
				if (!draft) return;
				const name = String(draft.name ?? "").trim();
				const model = String(draft.model ?? "").trim();
				if (!name || !model) { setMessage(t("vNeedFields")); return; }
				const id = String(draft.id ?? "").trim() || slugId(name);
				if (id !== draft.originalId && form.videoProviders.some((row) => row.id === id)) { setMessage(t("vDupId")); return; }
				const apiKeyEnv = String(draft.apiKeyEnv ?? "").trim() || KIND_DEFAULTS[draft.kind]?.apiKeyEnv || KEY_REF.openai;
				try {
					if (keyInput.trim().length > 0) {
						await props.credentials.set(apiKeyEnv, keyInput.trim());
						setKeyInput("");
						setKeyStatus((prev) => ({ ...prev, [apiKeyEnv]: true }));
					}
				} catch (cause) {
					setMessage(cause instanceof Error ? cause.message : String(cause));
					return;
				}
				const entry = {
					id,
					name,
					kind: KIND_ORDER.includes(draft.kind) ? draft.kind : "openai-compatible",
					baseUrl: String(draft.baseUrl ?? "").trim(),
					model,
					apiKeyEnv,
					i2v: draft.i2v === true,
				};
				const providers = draft.originalId === undefined
					? [...form.videoProviders, entry]
					: form.videoProviders.map((row) => (row.id === draft.originalId ? entry : row));
				let videoProviderId = form.videoProviderId;
				if (draft.originalId !== undefined && videoProviderId === draft.originalId) videoProviderId = entry.id;
				if (draft.originalId === undefined && form.videoProviders.length === 0) videoProviderId = entry.id;
				patchForm({ videoProviders: providers, videoProviderId });
				setDraft(null);
				setMessage("");
			};

			const removeEntry = (id) => {
				if (!window.confirm(t("vConfirmDelete", { name: id }))) return;
				const providers = form.videoProviders.filter((row) => row.id !== id);
				patchForm({
					videoProviders: providers,
					videoProviderId: form.videoProviderId === id ? (providers[0]?.id ?? "") : form.videoProviderId,
				});
			};

			const save = async (event) => {
				event.preventDefault();
				setSaving(true);
				setMessage("");
				try {
					await props.scope.mutate([
						{ op: "set", path: ["videoEnabled"], value: form.videoEnabled === true },
						{ op: "set", path: ["videoProviders"], value: form.videoProviders },
						{ op: "set", path: ["videoProviderId"], value: form.videoProviderId },
						{ op: "set", path: ["pollIntervalMs"], value: Number(form.pollIntervalMs) || 5000 },
						{ op: "set", path: ["waitTimeoutMs"], value: Number(form.waitTimeoutMs) || 600000 },
						{ op: "set", path: ["saveToWorkspace"], value: form.saveToWorkspace === true },
						{ op: "set", path: ["videoFolder"], value: String(form.videoFolder ?? "").trim() },
					]);
					setMessage(t("saved"));
				} catch (cause) {
					setMessage(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setSaving(false);
				}
			};

			const field = (labelText, control) => h("label", { className: "dsh-vg-field" },
				h("span", { className: "dsh-vg-label" }, labelText), control);
			const textInput = (value, onChange, extra) => h("input", Object.assign({
				type: "text", className: "dsh-vg-input", value: value ?? "", onChange: (e) => onChange(e.target.value),
			}, extra || {}));
			const keyBadge = (env) => (env
				? h("span", { className: "dsh-vg-status" }, keyStatus[env] === undefined ? t("checkingKey") : keyStatus[env] ? t("keyConfigured") : t("keyNotConfigured"))
				: null);

			return h("li", { className: `dsh-vg-card ${open ? "dsh-vg-card-open" : ""}` },
				h("button", {
					type: "button", className: "dsh-vg-head", "aria-expanded": open,
					onClick: () => setOpen((v) => !v),
				},
				h("span", { className: "dsh-vg-head-text" },
					h("span", { className: "dsh-vg-title" }, t("vCardTitle")),
					h("span", { className: "dsh-vg-desc" }, t("vCardDesc"))),
				h("span", { className: `dsh-vg-chevron ${open ? "dsh-vg-chevron-open" : ""}` },
					h("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "2" },
						h("path", { d: "M4 6l4 4 4-4" })))),
				open ? h("form", { className: "dsh-vg-body", onSubmit: save },
					h("div", { className: "dsh-vg-checkbox-row" },
						h("input", { type: "checkbox", id: "dmg-video-enabled", checked: form.videoEnabled === true, onChange: (e) => patchForm({ videoEnabled: e.target.checked }) }),
						h("label", { htmlFor: "dmg-video-enabled" }, t("vEnabled"))),
					h("div", { style: { margin: "10px 0 6px", fontWeight: 600, fontSize: "13px" } }, t("vCatalog")),
					form.videoProviders.length === 0
						? h("div", { className: "dsh-vg-status", style: { display: "block", marginBottom: "8px" } }, t("vCatalogEmpty"))
						: h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" } },
							form.videoProviders.map((entry) => h("div", {
								key: entry.id,
								style: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", border: "1px solid var(--dsw-alias-border-l2,#e5e7eb)", borderRadius: "8px" },
							},
							h("input", {
								type: "radio", name: "dmg-video-default", title: t("vMakeDefault"),
								checked: form.videoProviderId === entry.id,
								onChange: () => patchForm({ videoProviderId: entry.id }),
							}),
							h("div", { style: { flex: 1, minWidth: 0 } },
								h("div", { style: { fontSize: "13px", fontWeight: 500 } },
									entry.name || entry.id,
									entry.i2v === true ? h("span", { className: "dsh-vg-tag dsh-vg-tag-i2v", style: { marginLeft: "6px" } }, "i2v") : null,
									form.videoProviderId === entry.id ? h("span", { className: "dsh-vg-tag", style: { marginLeft: "6px" } }, t("vDefaultBadge")) : null),
								h("div", { className: "dsh-vg-status" }, `${t(KIND_LABEL_KEY[entry.kind] ?? "vKindOpenai")} · ${entry.model}`)),
							keyBadge(entry.apiKeyEnv),
							h("button", { type: "button", className: "dsh-vg-btn-reset", onClick: () => startEdit(entry) }, t("vEdit")),
							h("button", { type: "button", className: "dsh-vg-btn-reset", onClick: () => removeEntry(entry.id) }, t("vDelete"))))),
					h("button", { type: "button", className: "dsh-vg-btn-reset", style: { marginBottom: "10px" }, onClick: startAdd }, t("vAdd")),
					draft ? h("div", { style: { border: "1px dashed var(--dsw-alias-border-l1,#cfd4dc)", borderRadius: "10px", padding: "10px", marginBottom: "10px", display: "flex", flexDirection: "column", gap: "8px" } },
						field(t("vName"), textInput(draft.name, (v) => patchDraft(draft.isNew ? { name: v, id: slugId(v) } : { name: v }))),
						field(t("vId"), textInput(draft.id, (v) => patchDraft({ id: v }))),
						field(t("vKind"), h("select", {
							className: "dsh-vg-input", value: draft.kind,
							onChange: (e) => {
								const kind = KIND_ORDER.includes(e.target.value) ? e.target.value : "openai-compatible";
								patchDraft({ kind, baseUrl: "", apiKeyEnv: KIND_DEFAULTS[kind].apiKeyEnv, i2v: KIND_DEFAULTS[kind].i2v === true });
							},
						}, KIND_ORDER.map((kind) => h("option", { key: kind, value: kind }, t(KIND_LABEL_KEY[kind]))))),
						field(t("vModel"), react.createElement("div", { className: "dsh-vg-input-group" },
							textInput(draft.model, (v) => patchDraft({ model: v }), { list: "dmg-model-choices" }),
							react.createElement("button", {
								type: "button", className: "dsh-vg-btn-reset",
								onClick: () => { void fetchVideoModels(props, draft, setModelChoices); },
							}, t("vFetchModels")))),
						modelChoices.length > 0 ? react.createElement("datalist", { id: "dmg-model-choices" },
							modelChoices.map((id) => react.createElement("option", { key: id, value: id }))) : null,
						field(t("vBaseUrl"), textInput(draft.baseUrl, (v) => patchDraft({ baseUrl: v }), { placeholder: KIND_DEFAULTS[draft.kind]?.baseUrl ?? "" })),
						field(t("vKeyEnv"), textInput(draft.apiKeyEnv, (v) => patchDraft({ apiKeyEnv: v }))),
						field(t("apiKey"), h("div", { className: "dsh-vg-input-group" },
							h("input", { type: "password", className: "dsh-vg-input", value: keyInput, placeholder: t("apiKeyPlaceholder"), onChange: (e) => setKeyInput(e.target.value) }),
							keyBadge(draft.apiKeyEnv))),
						h("div", { className: "dsh-vg-checkbox-row" },
							h("input", { type: "checkbox", id: "dmg-draft-i2v", checked: draft.i2v === true, onChange: (e) => patchDraft({ i2v: e.target.checked }) }),
							h("label", { htmlFor: "dmg-draft-i2v" }, t("vI2v"),
								draft.kind === "openai-compatible" ? h("span", { className: "dsh-vg-status", style: { marginLeft: "6px" } }, t("vI2vHint")) : null)),
						h("div", { className: "dsh-vg-actions" },
							h("button", { type: "button", className: "dsh-vg-save", onClick: () => { void confirmDraft(); } }, t("vConfirm")),
							h("button", { type: "button", className: "dsh-vg-btn-reset", onClick: () => { setDraft(null); setKeyInput(""); setMessage(""); } }, t("vCancel")))) : null,
					field(t("pollInterval"), textInput(form.pollIntervalMs, (v) => patchForm({ pollIntervalMs: v }), { inputMode: "numeric" })),
					field(t("waitTimeout"), textInput(form.waitTimeoutMs, (v) => patchForm({ waitTimeoutMs: v }), { inputMode: "numeric" })),
					h("div", { className: "dsh-vg-checkbox-row" },
						h("input", { type: "checkbox", id: "dmg-save-ws", checked: form.saveToWorkspace === true, onChange: (e) => patchForm({ saveToWorkspace: e.target.checked }) }),
						h("label", { htmlFor: "dmg-save-ws" }, t("saveToWorkspace"))),
					form.saveToWorkspace ? field(t("workspaceFolder"), textInput(form.videoFolder, (v) => patchForm({ videoFolder: v }))) : null,
					h("div", { className: "dsh-vg-actions" },
						message ? h("span", { className: "dsh-vg-status" }, message) : null,
						h("button", { type: "submit", className: "dsh-vg-save", disabled: saving }, saving ? t("saving") : t("save")))) : null);
		}

		function videoMeta(block) {
			const meta = block?.meta ?? block?.resultView?.meta;
			if (meta && typeof meta.route === "string") return meta;
			const call = block?.call;
			const result = call?.result;
			const resultMeta = result?.meta ?? result?.resultView?.meta;
			if (resultMeta && typeof resultMeta.route === "string") return resultMeta;
			return undefined;
		}

		function GeneratedVideoCard(props) {
			const meta = videoMeta(props.block);
			const route = typeof meta?.route === "string" ? meta.route : undefined;
			const savedTo = typeof meta?.savedTo === "string" ? meta.savedTo : undefined;
			const isAnimate = meta?.operation === "animate";
			const attachment = meta?.attachment && typeof meta.attachment === "object" ? meta.attachment : undefined;
			const videoId = typeof meta?.videoId === "string" ? meta.videoId : "";
			const { url, error: resolveError } = useResolvedVideoUrl({ attachment, route });
			const [playbackError, setError] = react.useState(false);
			const [lang, setLang] = react.useState(() => props.locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh");

			react.useEffect(() => props.locale?.subscribe?.(() => {
				setLang(props.locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh");
			}), [props.locale]);

			const t = (keyName, params) => {
				let text = (lang === "en" ? DICT.en : DICT.zh)[keyName] || DICT.zh[keyName] || keyName;
				if (params) for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, v);
				return text;
			};

			// Auto-collect into gallery IndexedDB.
			// Key on the stable videoId so repeated mounts update one record instead of
			// creating duplicates, and so tombstones can reliably suppress deleted items.
			react.useEffect(() => {
				if (route === undefined || !videoId) return;
				const metaAny = meta || {};
				const prompt = typeof metaAny.prompt === "string" ? metaAny.prompt : "Generated Video";
				const provider = typeof metaAny.provider === "string" ? metaAny.provider : "dashscope";
				const model = typeof metaAny.model === "string" ? metaAny.model : "";

				saveGalleryItem({
					id: videoId,
					videoId,
					attachment,
					route,
					mediaType: metaAny.mediaType ?? "video/mp4",
					prompt, provider, model,
					bytes: typeof metaAny.bytes === "number" ? metaAny.bytes : 0,
					...(typeof metaAny.savedTo === "string" ? { savedTo: metaAny.savedTo } : {}),
					...(typeof metaAny.duration === "number" ? { duration: metaAny.duration } : {}),
					...(metaAny.operation === "animate" ? { operation: "animate" } : {}),
				}).catch(() => {});
			}, [videoId]);

			if (route === undefined && attachment === undefined) {
				return react_jsx_runtime.jsx("div", { className: "dsh-vg-loading", children: isAnimate ? t("animating") : t("generating") });
			}

			const downloadName = savedTo ? baseName(savedTo) : `dsh-video-${videoId || String(Date.now())}.mp4`;
			const download = (e) => {
				if (e) e.stopPropagation();
				if (!url) return;
				const a = document.createElement("a");
				a.href = url;
				a.download = downloadName;
				document.body.appendChild(a); a.click(); document.body.removeChild(a);
			};
			const openNewTab = (e) => {
				if (e) e.stopPropagation();
				if (!url) return;
				window.open(url, "_blank", "noopener,noreferrer");
			};
			const resolveFailed = resolveError !== null && url === null;

			return react_jsx_runtime.jsxs("section", {
				className: "dsh-vg-result",
				children: [
					react_jsx_runtime.jsx("div", { className: "dsh-vg-result-title", children: isAnimate ? t("animatedTitle") : t("generatedTitle") }),
					savedTo ? react_jsx_runtime.jsxs("div", { className: "dsh-vg-savedto", children: [t("savedToPath"), ": ", savedTo] }) : null,
					resolveFailed ? react_jsx_runtime.jsx("div", { className: "dsh-vg-error", children: t("galleryUnavailable") }) : null,
					react_jsx_runtime.jsx("div", {
						className: "dsh-vg-container",
						children: url && !playbackError
							? react_jsx_runtime.jsxs(react.Fragment, { children: [
								react_jsx_runtime.jsx("video", {
									className: "dsh-vg-video",
									controls: true,
									preload: "metadata",
									src: url,
									onError: () => setError(true)
								}),
								react_jsx_runtime.jsxs("div", { className: "dsh-vg-toolbar", children: [
									react_jsx_runtime.jsx("button", { type: "button", className: "dsh-vg-tool-btn", title: t("download"), onClick: download, children:
										react_jsx_runtime.jsx("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsxs("g", { children: [react_jsx_runtime.jsx("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }), react_jsx_runtime.jsx("polyline", { points: "7 10 12 15 17 10" }), react_jsx_runtime.jsx("line", { x1: "12", y1: "15", x2: "12", y2: "3" })] }) })
									}),
									react_jsx_runtime.jsx("button", { type: "button", className: "dsh-vg-tool-btn", title: t("openNewTab"), onClick: openNewTab, children:
										react_jsx_runtime.jsx("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsxs("g", { children: [react_jsx_runtime.jsx("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }), react_jsx_runtime.jsx("polyline", { points: "15 3 21 3 21 9" }), react_jsx_runtime.jsx("line", { x1: "10", y1: "14", x2: "21", y2: "3" })] }) })
									})
								] })
							] })
							: playbackError && url
								? react_jsx_runtime.jsx("div", { className: "dsh-vg-error", children: t("loadFailed", { status: "playback" }) })
								: react_jsx_runtime.jsx("div", { className: "dsh-vg-loading", children: t("loading") })
					})
				]
			});
		}
		//#endregion

		//#region gallery store (IndexedDB)
		// Gallery store and view adapted from dsh-image-gen
		// (https://github.com/shanliuling/dsh-image-gen), MIT License
		// © dsh-image-gen contributors.
		const DB_NAME = "dsh_video_gen_db";
		const DB_VERSION = 1;
		const STORE_NAME = "gallery_history";
		const TOMBSTONE_STORE = "gallery_tombstones";

		let dbPromise = null;
		let tombstonesCache = null;

		function getDB() {
			if (dbPromise) return dbPromise;
			dbPromise = new Promise((resolve, reject) => {
				if (typeof indexedDB === "undefined") {
					reject(new Error("IndexedDB is not supported"));
					return;
				}
				const request = indexedDB.open(DB_NAME, DB_VERSION);
				request.onupgradeneeded = (event) => {
					const db = event.target.result;
					if (!db.objectStoreNames.contains(STORE_NAME)) {
						const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
						store.createIndex("createdAt", "createdAt", { unique: false });
					}
					if (!db.objectStoreNames.contains(TOMBSTONE_STORE)) {
						db.createObjectStore(TOMBSTONE_STORE, { keyPath: "id" });
					}
				};
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			return dbPromise;
		}

		async function loadTombstones(db) {
			if (tombstonesCache) return tombstonesCache;
			return new Promise((resolve) => {
				if (!db.objectStoreNames.contains(TOMBSTONE_STORE)) { tombstonesCache = new Set(); resolve(tombstonesCache); return; }
				try {
					const tx = db.transaction(TOMBSTONE_STORE, "readonly");
					const store = tx.objectStore(TOMBSTONE_STORE);
					const req = store.getAllKeys();
					req.onsuccess = () => { tombstonesCache = new Set(req.result.map(String)); resolve(tombstonesCache); };
					req.onerror = () => { tombstonesCache = new Set(); resolve(tombstonesCache); };
				} catch { tombstonesCache = new Set(); resolve(tombstonesCache); }
			});
		}

		const galleryListeners = new Set();
		function notifyGalleryListeners() {
			for (const fn of galleryListeners) { try { fn(); } catch {} }
		}

		function subscribeGallery(listener) {
			galleryListeners.add(listener);
			return () => { galleryListeners.delete(listener); };
		}

		async function saveGalleryItem(item) {
			try {
				const db = await getDB();
				const tombstones = await loadTombstones(db);
				if (tombstones.has(item.id)) return;
				const record = { ...item, createdAt: item.createdAt ?? Date.now() };
				await new Promise((resolve, reject) => {
					const tx = db.transaction(STORE_NAME, "readwrite");
					const store = tx.objectStore(STORE_NAME);
					const req = store.put(record);
					req.onsuccess = () => resolve();
					req.onerror = () => reject(req.error);
				});
				notifyGalleryListeners();
			} catch (err) { console.warn("[dsh-video-gen] Failed to save gallery item:", err); }
		}

		async function getGalleryItems() {
			try {
				const db = await getDB();
				return new Promise((resolve, reject) => {
					const tx = db.transaction(STORE_NAME, "readonly");
					const store = tx.objectStore(STORE_NAME);
					const index = store.index("createdAt");
					const req = index.openCursor(null, "prev");
					const items = [];
					req.onsuccess = (event) => {
						const cursor = event.target.result;
						if (cursor) { items.push(cursor.value); cursor.continue(); }
						else resolve(items);
					};
					req.onerror = () => reject(req.error);
				});
			} catch (err) { console.warn("[dsh-video-gen] Failed to read gallery items:", err); return []; }
		}

		async function deleteGalleryItem(id) {
			try {
				const db = await getDB();
				const tombstones = await loadTombstones(db);
				tombstones.add(id);
				await new Promise((resolve, reject) => {
					const tx = db.transaction([STORE_NAME, TOMBSTONE_STORE], "readwrite");
					tx.objectStore(STORE_NAME).delete(id);
					tx.objectStore(TOMBSTONE_STORE).put({ id, deletedAt: Date.now() });
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
				});
				notifyGalleryListeners();
			} catch (err) { console.warn("[dsh-video-gen] Failed to delete gallery item:", err); }
		}

		/** Clear all gallery records and reset tombstones (parity with dsh-image-gen). */
		async function clearGallery() {
			try {
				const db = await getDB();
				if (tombstonesCache) tombstonesCache.clear();
				await new Promise((resolve, reject) => {
					const tx = db.transaction([STORE_NAME, TOMBSTONE_STORE], "readwrite");
					tx.objectStore(STORE_NAME).clear();
					tx.objectStore(TOMBSTONE_STORE).clear();
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
				});
				notifyGalleryListeners();
			} catch (err) { console.warn("[dsh-video-gen] Failed to clear gallery:", err); }
		}
		//#endregion

		//#region gallery view
		/**
		 * Resolve a playable video URL for a gallery item or a chat result card.
		 * Resolution order mirrors the server route:
		 * 1. POST { attachment } — the durable workspace file (works after cache
		 *    eviction and, via the marker index, after a host restart);
		 * 2. GET item.route (?id=) — the in-memory cache, still valid this lifetime.
		 * Returns { url, blob, loading, error }.
		 */
		function useResolvedVideoUrl(source) {
			const attachment = source && typeof source.attachment === "object" && source.attachment !== null ? source.attachment : undefined;
			const route = typeof source?.route === "string" && source.route.length > 0 ? source.route : undefined;
			const [url, setUrl] = react.useState(null);
			const [blob, setBlob] = react.useState(null);
			const [loading, setLoading] = react.useState(true);
			const [error, setError] = react.useState(null);

			react.useEffect(() => {
				let cancelled = false;
				const controller = new AbortController();
				let objectUrl;

				const finishRoute = () => {
					if (cancelled || controller.signal.aborted) return;
					if (route) {
						setUrl(route);
						setLoading(false);
					} else {
						setError("unavailable");
						setLoading(false);
					}
				};

				if (!attachment) {
					finishRoute();
					return () => { cancelled = true; };
				}

				fetch(VIDEO_ROUTE, {
					method: "POST",
					signal: controller.signal,
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ attachment }),
				})
					.then(async (response) => {
						if (!response.ok) throw new Error(`HTTP ${response.status}`);
						const resBlob = await response.blob();
						if (cancelled || controller.signal.aborted) return;
						setBlob(resBlob);
						objectUrl = URL.createObjectURL(resBlob);
						setUrl(objectUrl);
						setLoading(false);
					})
					.catch(() => {
						// The persistence fallback failed (e.g. the workspace file was
						// removed); the in-memory GET route may still hold the bytes.
						if (!controller.signal.aborted) finishRoute();
					});

				return () => {
					cancelled = true;
					controller.abort();
					if (objectUrl) URL.revokeObjectURL(objectUrl);
				};
			}, [attachment, route]);

			return { url, blob, loading, error };
		}

		function formatBytesLabel(bytes) {
			const n = typeof bytes === "number" ? bytes : Number(bytes);
			if (!Number.isFinite(n) || n <= 0) return null;
			const mb = n / (1024 * 1024);
			if (mb >= 1) return `${mb.toFixed(1)} MB`;
			return `${Math.max(1, Math.round(n / 1024))} KB`;
		}

		function formatDateLabel(createdAt) {
			if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return null;
			try {
				return new Date(createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
			} catch {
				return null;
			}
		}

		function baseName(path) {
			if (typeof path !== "string" || path.length === 0) return "";
			const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			return cut >= 0 ? path.slice(cut + 1) : path;
		}

		function GalleryViewTab(props) {
			const [items, setItems] = react.useState([]);
			const [search, setSearch] = react.useState("");
			const [selectedProvider, setSelectedProvider] = react.useState("all");
			const [previewItem, setPreviewItem] = react.useState(null);
			const [previewUrl, setPreviewUrl] = react.useState(null);
			const [toast, setToast] = react.useState(null);
			const [lang, setLang] = react.useState(() => (props.locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh"));

			react.useEffect(() => {
				if (!props.locale?.subscribe) return;
				return props.locale.subscribe(() => {
					setLang(props.locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh");
				});
			}, [props.locale]);

			const t = (keyName, params) => {
				let text = (lang === "en" ? DICT.en : DICT.zh)[keyName] || DICT.zh[keyName] || keyName;
				if (params) for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, v);
				return text;
			};

			const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

			react.useEffect(() => {
				const seat = document.querySelector("[data-composer-seat]");
				if (seat) {
					const prev = seat.style.display;
					seat.style.display = "none";
					return () => { seat.style.display = prev; };
				}
			}, []);

			react.useEffect(() => {
				let active = true;
				const load = () => { getGalleryItems().then((res) => { if (active) setItems(res); }); };
				load();
				const unsub = subscribeGallery(load);
				return () => { active = false; unsub(); };
			}, []);

			react.useEffect(() => {
				if (!previewItem) return;
				const onKey = (e) => { if (e.key === "Escape") setPreviewItem(null); };
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [previewItem]);

			const filteredItems = react.useMemo(() => {
				return items.filter((item) => {
					if (selectedProvider !== "all" && item.provider !== selectedProvider) return false;
					if (search.trim().length > 0) {
						const q = search.trim().toLowerCase();
						if (!(item.prompt || "").toLowerCase().includes(q) && !(item.model || "").toLowerCase().includes(q)) return false;
					}
					return true;
				});
			}, [items, search, selectedProvider]);

			return react_jsx_runtime.jsxs("div", { className: "dsh-vg-gallery-page", children: [
				react_jsx_runtime.jsxs("header", { className: "dsh-vg-gallery-page-header", children: [
					react_jsx_runtime.jsx("span", { className: "dsh-vg-gallery-page-count", children: t("galleryTotalCount", { count: String(items.length) }) }),
					react_jsx_runtime.jsxs("div", { className: "dsh-vg-gallery-page-tools", children: [
						react_jsx_runtime.jsxs("div", { className: "dsh-vg-gallery-search-wrap", children: [
							react_jsx_runtime.jsx("svg", { className: "dsh-vg-gallery-search-icon", width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsxs("g", { children: [react_jsx_runtime.jsx("circle", { cx: "11", cy: "11", r: "8" }), react_jsx_runtime.jsx("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })] }) }),
							react_jsx_runtime.jsx("input", { type: "text", className: "dsh-vg-gallery-search-input", placeholder: t("gallerySearchPlaceholder"), value: search, onChange: (e) => setSearch(e.target.value) })
						] }),
						react_jsx_runtime.jsxs("select", { className: "dsh-vg-gallery-select", value: selectedProvider, onChange: (e) => setSelectedProvider(e.target.value), children: [
							react_jsx_runtime.jsx("option", { value: "all", children: t("galleryFilterAll") }),
							react_jsx_runtime.jsx("option", { value: "dashscope", children: t("providerDashScope") }),
							react_jsx_runtime.jsx("option", { value: "volcengine", children: t("providerVolcengine") }),
							react_jsx_runtime.jsx("option", { value: "openai", children: t("providerOpenAI") }),
							react_jsx_runtime.jsx("option", { value: "google", children: t("providerGoogle") })
						] })
					] })
				] }),
				react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-page-body", children:
					items.length === 0
						? react_jsx_runtime.jsxs("div", { className: "dsh-vg-gallery-empty", children: [
							react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-empty-icon", children: "🎬" }),
							react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-empty-title", children: t("galleryEmptyTitle") }),
							react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-empty-desc", children: t("galleryEmptyDesc") })
						] })
						: filteredItems.length === 0
							? react_jsx_runtime.jsxs("div", { className: "dsh-vg-gallery-empty", children: [
								react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-empty-icon", children: "🔍" }),
								react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-empty-title", children: t("galleryNoMatchTitle") }),
								react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-empty-desc", children: t("galleryNoMatchDesc") })
							] })
							: react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-grid", children: filteredItems.map((item) =>
								react_jsx_runtime.jsx(GalleryCard, {
									item, t,
									onPreview: (it, resolvedUrl) => { setPreviewItem(it); setPreviewUrl(resolvedUrl); },
									onToast: showToast
								}, item.id)
							) })
				}),
				toast ? react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-page-toast", children: toast }) : null,
				previewItem ? react_jsx_runtime.jsx(GalleryLightbox, { item: previewItem, initialUrl: previewUrl, t, onToast: showToast, onClose: () => { setPreviewItem(null); setPreviewUrl(null); } }) : null
			] });
		}

		function GalleryCard(props) {
			const { item, t, onPreview, onToast } = props;
			const { url, loading, error } = useResolvedVideoUrl(item);
			const [playbackError, setPlaybackError] = react.useState(false);
			const copyPrompt = async (e) => {
				e.stopPropagation();
				try { await navigator.clipboard.writeText(item.prompt); onToast(t("copiedPrompt")); }
				catch { onToast(t("copyFailed")); }
			};
			const downloadVideo = (e) => {
				e.stopPropagation();
				if (!url) return;
				const a = document.createElement("a");
				a.href = url;
				a.download = item.savedTo ? baseName(item.savedTo) : `dsh-${item.provider}-${item.id}.mp4`;
				document.body.appendChild(a); a.click(); document.body.removeChild(a);
			};
			const deleteItem = async (e) => {
				e.stopPropagation();
				if (!window.confirm(t("galleryConfirmDelete"))) return;
				await deleteGalleryItem(item.id);
				onToast(t("galleryDeleted"));
			};

			const sizeLabel = formatBytesLabel(item.bytes);
			const durationLabel = typeof item.duration === "number" && item.duration > 0 ? `${item.duration}s` : null;
			const dateLabel = formatDateLabel(item.createdAt);
			const subParts = [sizeLabel, durationLabel, dateLabel].filter(Boolean);
			const unavailable = error !== null || playbackError;

			return react_jsx_runtime.jsxs("div", {
				className: "dsh-vg-gallery-card",
				onClick: () => { if (url && !playbackError) onPreview(item, url); },
				children: [
					react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-card-media", children:
						loading
							? react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-card-loading", children: "..." })
							: unavailable
								? react_jsx_runtime.jsxs("div", { className: "dsh-vg-gallery-card-error", children: ["⚠️ ", t("galleryUnavailable")] })
								: react_jsx_runtime.jsx("video", { className: "dsh-vg-gallery-card-video", src: url, preload: "metadata", muted: true, disablePictureInPicture: true, onError: () => setPlaybackError(true), onMouseEnter: (e) => { try { e.target.play().catch(() => {}); } catch {} }, onMouseLeave: (e) => { try { e.target.pause(); e.target.currentTime = 0; } catch {} } })
					}),
					url && !loading && !unavailable ? react_jsx_runtime.jsxs("div", { className: "dsh-vg-card-toolbar", children: [
						react_jsx_runtime.jsx("button", { type: "button", className: "dsh-vg-tool-btn", title: t("download"), onClick: downloadVideo, children:
							react_jsx_runtime.jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsxs("g", { children: [react_jsx_runtime.jsx("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }), react_jsx_runtime.jsx("polyline", { points: "7 10 12 15 17 10" }), react_jsx_runtime.jsx("line", { x1: "12", y1: "15", x2: "12", y2: "3" })] }) })
						}),
						react_jsx_runtime.jsx("button", { type: "button", className: "dsh-vg-tool-btn", title: t("copyPpt"), onClick: (e) => { void copyPrompt(e); }, children:
							react_jsx_runtime.jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsxs("g", { children: [react_jsx_runtime.jsx("path", { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" }), react_jsx_runtime.jsx("rect", { x: "8", y: "2", width: "8", height: "4", rx: "1", ry: "1" })] }) })
						}),
						react_jsx_runtime.jsx("button", { type: "button", className: "dsh-vg-tool-btn dsh-vg-tool-btn-danger", title: t("galleryDelete"), onClick: (e) => { void deleteItem(e); }, children:
							react_jsx_runtime.jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsxs("g", { children: [react_jsx_runtime.jsx("polyline", { points: "3 6 5 6 21 6" }), react_jsx_runtime.jsx("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }), react_jsx_runtime.jsx("line", { x1: "10", y1: "11", x2: "10", y2: "17" }), react_jsx_runtime.jsx("line", { x1: "14", y1: "11", x2: "14", y2: "17" })] }) })
						})
					] }) : null,
					react_jsx_runtime.jsxs("div", { className: "dsh-vg-gallery-card-meta", children: [
						react_jsx_runtime.jsxs("div", { className: "dsh-vg-gallery-card-header", children: [
							react_jsx_runtime.jsx("span", { className: "dsh-vg-tag", children: item.provider }),
							item.model ? react_jsx_runtime.jsx("span", { className: "dsh-vg-tag dsh-vg-tag-model", children: item.model }) : null,
							item.operation === "animate" ? react_jsx_runtime.jsx("span", { className: "dsh-vg-tag dsh-vg-tag-i2v", children: t("galleryI2v") }) : null
						] }),
						react_jsx_runtime.jsx("p", { className: "dsh-vg-gallery-card-prompt", title: item.prompt, children: item.prompt }),
						subParts.length > 0 ? react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-card-sub", children:
							subParts.map((part, index) => react_jsx_runtime.jsx("span", { children: part }, index))
						}) : null
					] })
				]
			});
		}

		function GalleryLightbox(props) {
			const { item, t, onToast, onClose } = props;
			// Reuse the URL the card already resolved when available, so opening the
			// lightbox never re-downloads a large video file.
			const own = useResolvedVideoUrl(item);
			const url = typeof props.initialUrl === "string" ? props.initialUrl : own.url;
			const loading = props.initialUrl ? false : own.loading;
			const error = props.initialUrl ? null : own.error;
			const [playbackError, setPlaybackError] = react.useState(false);
			const copyPrompt = async () => {
				try { await navigator.clipboard.writeText(item.prompt); onToast(t("copiedPrompt")); }
				catch { onToast(t("copyFailed")); }
			};
			const downloadVideo = () => {
				if (!url) return;
				const a = document.createElement("a");
				a.href = url;
				a.download = item.savedTo ? baseName(item.savedTo) : `dsh-${item.provider}-${item.id}.mp4`;
				document.body.appendChild(a); a.click(); document.body.removeChild(a);
			};
			const deleteItem = async () => {
				if (!window.confirm(t("galleryConfirmDelete"))) return;
				await deleteGalleryItem(item.id);
				onToast(t("galleryDeleted"));
				onClose();
			};

			return react_jsx_runtime.jsxs("div", { className: "dsh-vg-lightbox-backdrop", onClick: onClose, children: [
				react_jsx_runtime.jsxs("div", { className: "dsh-vg-lightbox-topbar", onClick: (e) => e.stopPropagation(), children: [
					react_jsx_runtime.jsxs("div", { className: "dsh-vg-lightbox-meta", children: [
						react_jsx_runtime.jsx("span", { className: "dsh-vg-tag", children: item.provider }),
						item.model ? react_jsx_runtime.jsx("span", { className: "dsh-vg-tag dsh-vg-tag-model", children: item.model }) : null,
						item.operation === "animate" ? react_jsx_runtime.jsx("span", { className: "dsh-vg-tag dsh-vg-tag-i2v", children: t("galleryI2v") }) : null
					] }),
					react_jsx_runtime.jsx("button", { type: "button", className: "dsh-vg-lightbox-close-btn", title: t("close"), onClick: onClose, children:
						react_jsx_runtime.jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsxs("g", { children: [react_jsx_runtime.jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), react_jsx_runtime.jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })
					})
				] }),
				react_jsx_runtime.jsx("div", { className: "dsh-vg-lightbox-video-wrap", onClick: (e) => e.stopPropagation(), children:
					loading
						? react_jsx_runtime.jsx("div", { style: { color: "#fff", fontSize: "14px" }, children: "Loading..." })
						: (error !== null || playbackError) && !url
							? react_jsx_runtime.jsxs("div", { style: { color: "#fca5a5", fontSize: "14px" }, children: ["⚠️ ", t("galleryUnavailable")] })
							: react_jsx_runtime.jsx("video", { className: "dsh-vg-lightbox-video", src: url, controls: true, autoPlay: true, onError: () => setPlaybackError(true), onLoadedMetadata: () => setPlaybackError(false) })
				}),
				react_jsx_runtime.jsxs("div", { className: "dsh-vg-lightbox-bottombar", onClick: (e) => e.stopPropagation(), children: [
					react_jsx_runtime.jsx("div", { className: "dsh-vg-lightbox-prompt-text", title: item.prompt, children: item.prompt }),
					item.savedTo ? react_jsx_runtime.jsx("div", { className: "dsh-vg-lightbox-savedto", children: item.savedTo }) : null,
					react_jsx_runtime.jsxs("div", { className: "dsh-vg-lightbox-actions", children: [
						react_jsx_runtime.jsxs("button", { type: "button", className: "dsh-vg-lightbox-btn", title: t("copyPpt"), onClick: copyPrompt, children: [
							react_jsx_runtime.jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsxs("g", { children: [react_jsx_runtime.jsx("path", { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" }), react_jsx_runtime.jsx("rect", { x: "8", y: "2", width: "8", height: "4", rx: "1", ry: "1" })] }) }),
							react_jsx_runtime.jsx("span", { children: t("copyPpt") })
						] }),
						react_jsx_runtime.jsxs("button", { type: "button", className: "dsh-vg-lightbox-btn", title: t("download"), onClick: downloadVideo, children: [
							react_jsx_runtime.jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsxs("g", { children: [react_jsx_runtime.jsx("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }), react_jsx_runtime.jsx("polyline", { points: "7 10 12 15 17 10" }), react_jsx_runtime.jsx("line", { x1: "12", y1: "15", x2: "12", y2: "3" })] }) }),
							react_jsx_runtime.jsx("span", { children: t("download") })
						] }),
						react_jsx_runtime.jsxs("button", { type: "button", className: "dsh-vg-lightbox-btn dsh-vg-lightbox-btn-danger", title: t("galleryDelete"), onClick: () => { deleteItem(); }, children: [
							react_jsx_runtime.jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsxs("g", { children: [react_jsx_runtime.jsx("polyline", { points: "3 6 5 6 21 6" }), react_jsx_runtime.jsx("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }), react_jsx_runtime.jsx("line", { x1: "10", y1: "11", x2: "10", y2: "17" }), react_jsx_runtime.jsx("line", { x1: "14", y1: "11", x2: "14", y2: "17" })] }) }),
							react_jsx_runtime.jsx("span", { children: t("galleryDelete") })
						] })
					] })
				] })
			] });
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		exports.VideoGenerationSettingsCard = VideoGenerationSettingsCard;
		exports.GeneratedVideoCard = GeneratedVideoCard;
		return module.exports;
	}
});