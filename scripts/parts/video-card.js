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
						field(t("vModel"), textInput(draft.model, (v) => patchDraft({ model: v }))),
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

