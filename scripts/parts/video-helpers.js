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

		/** plugins.bundle.config 页面（DSH >= 0.1.6）：视频设置卡与生图选择卡并列。 */
		function VideoSettingsPage(props) {
			if (props.view === "summary") return null;
			return react.createElement("ul", { style: { listStyle: "none", margin: 0, padding: 0 } },
				react.createElement(VideoGenerationSettingsCard, props));
		}
