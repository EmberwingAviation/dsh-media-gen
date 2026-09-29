/**
 * dsh-media-gen — 合并 client 入口（由 scripts/build-client.mjs 生成，勿手改）。
 * 源：lib/client-image.js（dsh-image-generation@0.1.2 client，MIT）
 *     lib/client-video.js（dsh-video-gen@0.2.4 client 补丁版，MIT）
 */
window.__ModuleLoader__.load({
  id: 'dsh-media-gen',
  factory: (require) => {
    const imageHalf = (() => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    // Icon exports were renamed in DSH 0.1.7 (size suffix dropped in favor of
    // Regular/Medium weights); resolve whichever name this runtime exports.
    const pickIcon = (...names) => names.map((n) => primitives[n]).find((v) => typeof v === 'function')
    const IconTrash = pickIcon('IconTrashOutline16', 'IconTrashOutlineRegular', 'IconTrashOutlineMedium')
    const IconClose = pickIcon('IconCloseOutline16', 'IconCloseOutlineRegular', 'IconCloseOutlineMedium')
    const IconPlus = pickIcon('IconPlusOutline16', 'IconPlusOutlineRegular', 'IconPlusOutlineMedium')
    const IconChevronDown = pickIcon('IconChevronDownOutline14', 'IconChevronDownOutlineRegular', 'IconChevronDownOutlineMedium')
    const IconChevronUp = pickIcon('IconChevronUpOutline14', 'IconChevronUpOutlineRegular', 'IconChevronUpOutlineMedium')
    const IconSparkle = pickIcon('IconSparkle16', 'IconSparkleRegular', 'IconSparkleMedium')
    const Menu = primitives.Menu

    const SELECT_CSS = '.dsh-ig-select{box-sizing:border-box;background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex;max-width:min(100%,280px)}.dsh-ig-select:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dsh-ig-select:disabled{opacity:.5;cursor:default}.dsh-ig-select-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'

    function ensureSelectCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css="dsh-image-generation-select"]')) return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-image-generation'
      tag.dataset.pluginCss = 'dsh-image-generation-select'
      tag.textContent = SELECT_CSS
      document.head.appendChild(tag)
    }

    const CATALOG_NS = 'media-gen'
    const RUNTIME_NS = 'media-gen'
    const LOCALE_NS = 'settings.image-gen'
    const RPC_CHANNEL = '/image-gen'

    /** host loopback RPC（apply 时注入）；供"拉取上游模型"按钮使用，密钥始终留在 host 侧。 */
    let IMAGE_RPC = null

    /** 经 host 调 GET {baseUrl}/models（凭据在服务端解析），把缺失的模型 id 合并进草稿。 */
    async function fetchUpstreamModelsIntoDraft(draft, setDraft) {
      if (!IMAGE_RPC || typeof IMAGE_RPC.call !== 'function') {
        window.alert('RPC unavailable')
        return
      }
      try {
        const result = await IMAGE_RPC.call(RPC_CHANNEL, 'models', { baseUrl: draft.baseUrl, apiKeyEnv: draft.apiKeyEnv })
        if (!result.ok) throw new Error(result.error?.message ?? 'fetch failed')
        const ids = Array.isArray(result.value?.ids) ? result.value.ids : []
        if (ids.length === 0) {
          window.alert('upstream returned no models')
          return
        }
        const have = new Set((draft.models ?? []).map((m) => m.id))
        const added = ids.filter((id) => !have.has(id)).map((id) => ({ id, name: id }))
        setDraft({ ...draft, models: [...(draft.models ?? []), ...added] })
      } catch (cause) {
        window.alert(cause instanceof Error ? cause.message : String(cause))
      }
    }

    const API_FORMATS = [
      { id: 'openai-images', label: 'OpenAI Images (/v1/images/generations)', hint: 'gpt-image-2、DALL·E、以及兼容 OpenAI Images 的网关' },
      { id: 'xai-images', label: 'xAI Images (/v1/images/generations)', hint: 'grok-imagine-image-2.0，使用 aspect_ratio' },
      { id: 'gemini-image', label: 'Gemini / Imagen (generateContent / predict)', hint: 'gemini-*-image、imagen-*；官方需 generativelanguage.googleapis.com' },
      { id: 'openai-chat-image', label: 'OpenAI Chat Completions (/v1/chat/completions)', hint: '在对话响应中返回图片的模型（部分聚合网关）' },
    ]

    const en = {
      nav: 'Image generation',
      title: 'Image generation',
      intro: 'Add image providers and models here. Then pick one model under Settings → Plugins → Plugin configuration → Image generation. Conversations call image_generate with that model.',
      addProvider: 'Add provider',
      providerName: 'Name',
      baseUrl: 'Base URL',
      apiFormat: 'API format',
      apiKey: 'API Key',
      apiKeyPlaceholder: 'Enter an API key, or leave blank to keep the stored one',
      apiKeySet: 'Configured',
      apiKeyUnset: 'Not configured',
      models: 'Models',
      fetchModels: 'Fetch upstream models',
      defaultsNav: 'Image defaults',
      cliOutDir: 'CLI output directory',
      cliOutDirHint: 'Default save directory for the gen-image.mjs command-line tool (absolute path); written to the CLI config mirror on save.',
      cliTimeout: 'CLI request timeout (ms)',
      cliTimeoutHint: 'Per-request timeout ceiling for gen-image.mjs; raise it when upstream is congested.',
      lane: 'Agent image lane',
      laneHint: 'auto: plain generations via the CLI, reference edits / inline attachments / gallery via the native tool; cli: always CLI; tool: always native tool; subagent: always delegate to a subagent. Saved into the CLI mirror and honored by the Agent.',
      lane_auto: 'auto (recommended)',
      lane_cli: 'CLI direct',
      lane_tool: 'native tool',
      lane_subagent: 'subagent',
      addModel: 'Add model',
      modelId: 'Model ID',
      modelName: 'Display name',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved.',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      empty: 'No image providers yet. Add one to get started.',
      loadFailed: 'Could not load image-generation settings.',
      retry: 'Retry',
      readOnly: 'Settings are read-only in this deployment.',
      nameRequired: 'Provider name is required.',
      baseUrlRequired: 'Base URL is required.',
      modelRequired: 'Add at least one model, or delete unused rows.',
      modelIdRequired: 'Model ID is required.',
      modelIdDuplicate: 'Model IDs must be unique.',
      conflict: 'Settings changed elsewhere. Reopen this card and try again.',
      saveFailed: 'The deployment did not accept these values.',
      cardTitle: 'Image generation',
      cardDescription: 'Choose the single model conversations use for image_generate.',
      enabled: 'Enable image_generate',
      enabledHint: 'When off, the tool refuses until you turn it back on.',
      pickModel: 'Active model',
      pickHint: 'Only one model can be active. Configure providers under Image generation in the sidebar.',
      noModels: 'No models yet. Add providers under Settings → Image generation first.',
      expand: 'Expand',
      collapse: 'Collapse',
      discard: 'Discard',
      unsaved: 'Unsaved',
      generating: 'Generating…',
      image: 'Image',
      viewImage: 'View image',
      viewImageNamed: 'View {name}',
      imageLoading: 'Loading image…',
      imageLoadFailed: 'Could not load image. Click to retry.',
      imagePreview: 'Image preview',
      imageClose: 'Close',
      defaultSize: 'Default size',
      defaultQuality: 'Default quality',
    }

    const zh = {
      nav: '生图',
      title: '生图配置',
      intro: '在这里添加生图供应商和模型。然后到 设置 → 插件 → 插件配置 → 图形生成 中选择一个模型。对话需要生图时，会调用 image_generate 使用该模型。',
      addProvider: '添加供应商',
      providerName: '名称',
      baseUrl: 'Base URL',
      apiFormat: 'API 格式',
      apiKey: 'API Key',
      apiKeyPlaceholder: '输入 API Key，留空则保留已保存的密钥',
      apiKeySet: '已配置',
      apiKeyUnset: '未配置',
      models: '模型列表',
      fetchModels: '拉取上游模型',
      defaultsNav: '生图默认',
      cliOutDir: '命令行出图输出目录',
      cliOutDirHint: 'gen-image.mjs 命令行工具的默认保存目录（绝对路径）；保存后自动写入 CLI 配置镜像。',
      cliTimeout: '命令行出图请求超时 (ms)',
      cliTimeoutHint: 'gen-image.mjs 单次请求的超时上限；上游拥堵时可适当调大。',
      lane: 'Agent 出图通道',
      laneHint: 'auto：简单出图走命令行、需要参考图/内联附件/画廊时走原生工具；cli：一律命令行；tool：一律原生工具；subagent：一律经子代理隔离调用。保存后写入 CLI 镜像，Agent 读取并遵守。',
      lane_auto: 'auto（推荐）',
      lane_cli: '命令行直连',
      lane_tool: '原生工具',
      lane_subagent: '子代理',
      addModel: '添加模型',
      modelId: '模型 ID',
      modelName: '显示名称',
      save: '保存',
      saving: '保存中…',
      saved: '已保存。',
      cancel: '取消',
      delete: '删除',
      edit: '编辑',
      empty: '还没有生图供应商，点击下方按钮添加。',
      loadFailed: '无法加载生图配置。',
      retry: '重试',
      readOnly: '当前部署的设置为只读。',
      nameRequired: '请填写供应商名称。',
      baseUrlRequired: '请填写 Base URL。',
      modelRequired: '请至少添加一个模型，或删掉空行。',
      modelIdRequired: '模型 ID 不能为空。',
      modelIdDuplicate: '模型 ID 不能重复。',
      conflict: '设置已在其他位置更新，请关闭后重试。',
      saveFailed: '保存失败，已保留你的修改。',
      cardTitle: '图形生成',
      cardDescription: '选择对话里 image_generate 实际使用的那一个模型。',
      enabled: '启用 image_generate',
      enabledHint: '关闭后工具会拒绝生图，直到重新打开。',
      pickModel: '当前模型',
      pickHint: '只能选择一个模型。供应商和模型在左侧「生图配置」中维护。',
      noModels: '还没有可用模型。请先到 设置 → 生图配置 添加供应商。',
      expand: '展开设置',
      collapse: '收起设置',
      discard: '放弃修改',
      unsaved: '未保存',
      generating: '正在生成…',
      image: '图片',
      viewImage: '查看图片',
      viewImageNamed: '查看 {name}',
      imageLoading: '正在加载图片…',
      imageLoadFailed: '图片加载失败，点击重试。',
      imagePreview: '图片预览',
      imageClose: '关闭',
      defaultSize: '默认尺寸',
      defaultQuality: '默认质量',
    }

    function translateFactory(dict) {
      return (key, params) => {
        let text = dict[key] ?? en[key] ?? key
        for (const [name, value] of Object.entries(params ?? {})) {
          text = String(text).replaceAll(`{${name}}`, String(value))
        }
        return text
      }
    }

    function slugify(name) {
      const slug = String(name ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      return slug || 'provider'
    }

    function apiKeyEnvFor(id) {
      return `IMAGE_GEN_${String(id).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
    }

    function uniqueId(name, taken) {
      const base = slugify(name)
      if (!taken.has(base)) return base
      let n = 2
      while (taken.has(`${base}-${n}`)) n += 1
      return `${base}-${n}`
    }

    function newModel() {
      return { id: '', name: '' }
    }

    function cloneProviders(value) {
      const list = Array.isArray(value?.providers) ? value.providers : []
      return list.map((row) => ({
        id: String(row.id ?? ''),
        name: String(row.name ?? ''),
        baseUrl: String(row.baseUrl ?? ''),
        apiFormat: String(row.apiFormat ?? 'openai-images'),
        apiKeyEnv: String(row.apiKeyEnv ?? ''),
        models: Array.isArray(row.models)
          ? row.models.map((model) => ({ id: String(model.id ?? ''), name: String(model.name ?? '') }))
          : [],
      }))
    }

    const css = {
      section: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640, color: 'var(--dsw-alias-label-primary)' },
      title: { margin: 0, fontSize: 18, fontWeight: 600, lineHeight: '26px' },
      intro: { margin: 0, color: 'var(--dsw-alias-label-tertiary)', fontSize: 14, lineHeight: '22px' },
      card: {
        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12,
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
        background: 'var(--dsw-alias-bg-layer-3)',
      },
      row: { display: 'flex', alignItems: 'center', gap: 8 },
      name: { fontWeight: 500, fontSize: 14, lineHeight: '22px', flex: 1, minWidth: 0 },
      meta: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
      field: { display: 'flex', flexDirection: 'column', gap: 4 },
      label: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' },
      input: {
        height: 32, width: '100%', boxSizing: 'border-box',
        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8,
        padding: '0 10px', font: 'inherit', fontSize: 14, lineHeight: '22px',
        background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
      },
      modelRow: {
        display: 'flex', alignItems: 'center', gap: 8,
        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10,
        padding: '8px 10px',
      },
      button: {
        boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        height: 28, padding: '0 10px', borderRadius: 14,
        border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
        color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 12, lineHeight: '18px',
        cursor: 'pointer',
      },
      primary: {
        boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        height: 32, padding: '0 14px', borderRadius: 16, border: 'none',
        background: 'var(--dsw-alias-button-primary-fill, #3b82f6)',
        color: 'var(--dsw-alias-label-primary-foreground, #fff)',
        font: 'inherit', fontSize: 13, cursor: 'pointer',
      },
      iconBtn: {
        boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer',
        color: 'var(--dsw-alias-label-tertiary)', borderRadius: 8, padding: 0, flex: 'none',
      },
      error: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)' },
      ok: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-success-primary)' },
      actions: { display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' },
      pluginCard: {
        border: '0.5px solid var(--dsw-alias-border-l4)', background: 'var(--dsw-alias-bg-layer-3)',
        borderRadius: 16, listStyle: 'none',
      },
      pluginHeader: {
        appearance: 'none', width: '100%', font: 'inherit', color: 'inherit', textAlign: 'left',
        cursor: 'pointer', background: 'transparent', border: 0, borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
      },
      pluginName: { color: 'var(--dsw-alias-label-primary)', fontSize: 15, fontWeight: 600, lineHeight: 1.4 },
      pluginDesc: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, lineHeight: 1.5 },
      pluginBody: { borderTop: '0.5px solid var(--dsw-alias-border-l2)', margin: '0 16px', paddingBottom: 8 },
      switch: {
        boxSizing: 'border-box', background: 'var(--dsw-alias-border-l3)', cursor: 'pointer',
        border: 0, borderRadius: 10, flex: 'none', width: 36, height: 20, padding: 2, position: 'relative',
      },
      prefRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' },
      prefLabel: { minWidth: 0, flex: 1, color: 'var(--dsw-alias-label-primary)', fontSize: 14, lineHeight: '22px' },
    }

    function SelectMenu(props) {
      const [open, setOpen] = React.useState(false)
      const active = props.options.find((row) => row.id === props.value)?.label ?? props.placeholder ?? props.value ?? ''
      if (typeof Menu !== 'function') return null
      return React.createElement(Menu, {
        open,
        onClose: () => setOpen(false),
        items: props.options,
        selectedId: props.value,
        onSelect: (id) => {
          setOpen(false)
          props.onPick(id)
        },
        align: 'end',
        portal: true,
        dense: true,
        anchor: React.createElement('button', {
          type: 'button',
          className: 'dsh-ig-select',
          disabled: props.disabled || props.options.length === 0,
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          'aria-label': props.label,
          onClick: () => setOpen((value) => !value),
        },
          React.createElement('span', { className: 'dsh-ig-select-label' }, active),
          IconChevronDown ? React.createElement(IconChevronDown, { size: 14 }) : null,
        ),
      })
    }

    function PrefRow(props) {
      return React.createElement('div', { style: css.prefRow },
        React.createElement('span', { style: css.prefLabel }, props.label),
        React.createElement(SelectMenu, {
          label: props.label,
          value: props.value,
          options: props.options,
          disabled: props.disabled,
          placeholder: props.placeholder,
          onPick: props.onPick,
        }),
      )
    }

    function IconButton(props) {
      return React.createElement('button', {
        type: 'button',
        style: { ...css.iconBtn, ...props.style },
        disabled: props.disabled,
        'aria-label': props.label,
        onClick: props.onClick,
      }, props.children)
    }

    function formatLabel(id) {
      return API_FORMATS.find((row) => row.id === id)?.label ?? id
    }

    function formatHint(id) {
      return API_FORMATS.find((row) => row.id === id)?.hint ?? ''
    }

    function useSnapshot(scope) {
      const [snap, setSnap] = React.useState(() => scope.getSnapshot())
      React.useEffect(() => {
        setSnap(scope.getSnapshot())
        return scope.subscribe(() => setSnap(scope.getSnapshot()))
      }, [scope])
      return snap
    }

    function ProviderEditor(props) {
      const { t, draft, setDraft, keyDraft, setKeyDraft, keyState, busy, error, saved, writable, onSave, onCancel, onDelete } = props
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        React.createElement('div', { style: css.row },
          React.createElement('input', {
            style: { ...css.input, fontWeight: 600 },
            value: draft.name,
            placeholder: t('providerName'),
            'aria-label': t('providerName'),
            disabled: !writable || busy,
            onChange: (event) => setDraft({ ...draft, name: event.target.value }),
          }),
          React.createElement(IconButton, {
            label: t('delete'), disabled: !writable || busy, onClick: onDelete,
          }, IconTrash ? React.createElement(IconTrash, { size: 16 }) : t('delete')),
        ),
        React.createElement('div', { style: css.field },
          React.createElement('span', { style: css.label }, t('baseUrl')),
          React.createElement('input', {
            style: css.input, value: draft.baseUrl, placeholder: 'https://api.example.com/v1',
            'aria-label': t('baseUrl'), disabled: !writable || busy,
            onChange: (event) => setDraft({ ...draft, baseUrl: event.target.value }),
          }),
        ),
        React.createElement('div', { style: css.field },
          React.createElement(PrefRow, {
            label: t('apiFormat'),
            value: draft.apiFormat,
            disabled: !writable || busy,
            options: API_FORMATS.map((row) => ({ id: row.id, label: row.label })),
            onPick: (id) => setDraft({ ...draft, apiFormat: id }),
          }),
          React.createElement('p', { style: css.meta }, formatHint(draft.apiFormat)),
        ),
        React.createElement('div', { style: css.field },
          React.createElement('span', { style: css.label }, `${t('apiKey')} · ${keyState ? t('apiKeySet') : t('apiKeyUnset')}`),
          React.createElement('input', {
            style: css.input, type: 'password', autoComplete: 'off', value: keyDraft,
            placeholder: t('apiKeyPlaceholder'), 'aria-label': t('apiKey'),
            disabled: !writable || busy,
            onChange: (event) => setKeyDraft(event.target.value),
          }),
        ),
        React.createElement('div', { style: css.field },
          React.createElement('span', { style: css.label }, t('models')),
          (draft.models ?? []).map((model, index) => React.createElement('div', { key: index, style: css.modelRow },
            React.createElement('input', {
              style: { ...css.input, flex: 1 },
              value: model.id,
              placeholder: t('modelId'),
              'aria-label': t('modelId'),
              disabled: !writable || busy,
              onChange: (event) => {
                const models = draft.models.slice()
                models[index] = { ...models[index], id: event.target.value }
                setDraft({ ...draft, models })
              },
            }),
            React.createElement('input', {
              style: { ...css.input, flex: 1 },
              value: model.name,
              placeholder: t('modelName'),
              'aria-label': t('modelName'),
              disabled: !writable || busy,
              onChange: (event) => {
                const models = draft.models.slice()
                models[index] = { ...models[index], name: event.target.value }
                setDraft({ ...draft, models })
              },
            }),
            React.createElement(IconButton, {
              label: t('delete'), disabled: !writable || busy,
              onClick: () => setDraft({ ...draft, models: draft.models.filter((_, i) => i !== index) }),
            }, IconTrash ? React.createElement(IconTrash, { size: 16 }) : t('delete')),
          )),
          React.createElement('button', {
            type: 'button', style: { ...css.button, alignSelf: 'flex-start', marginTop: 4, gap: 4 },
            disabled: !writable || busy,
            onClick: () => setDraft({ ...draft, models: [...draft.models, newModel()] }),
          },
            IconPlus ? React.createElement(IconPlus, { size: 14 }) : null,
            t('addModel'),
          ),
          React.createElement('button', {
            type: 'button', style: { ...css.button, alignSelf: 'flex-start', marginTop: 4, gap: 4 },
            disabled: !writable || busy,
            onClick: () => { void fetchUpstreamModelsIntoDraft(draft, setDraft) },
          }, t('fetchModels')),
        ),
        error ? React.createElement('p', { style: css.error, role: 'alert' }, error) : null,
        saved ? React.createElement('p', { style: css.ok, role: 'status' }, t('saved')) : null,
        React.createElement('div', { style: css.actions },
          React.createElement('button', { type: 'button', style: css.button, disabled: busy, onClick: onCancel }, t('cancel')),
          React.createElement('button', {
            type: 'button', style: css.primary, disabled: !writable || busy, onClick: onSave,
          }, busy ? t('saving') : t('save')),
        ),
      )
    }

    function CatalogSection(props) {
      const t = props.t ?? translateFactory(en)
      const scope = props.catalog
      const credentials = props.credentials
      const snap = useSnapshot(scope)
      const [openId, setOpenId] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [keyDraft, setKeyDraft] = React.useState('')
      const [keyMap, setKeyMap] = React.useState({})
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [saved, setSaved] = React.useState(false)
      const [creating, setCreating] = React.useState(false)

      const providers = cloneProviders(snap.value)
      const writable = snap.writable !== false && snap.status === 'ready'

      const refreshKeys = React.useCallback(async (list) => {
        const refs = list.map((row) => row.apiKeyEnv).filter(Boolean)
        if (refs.length === 0 || !credentials) return
        const response = await credentials.describe(refs)
        if (!response?.ok) return
        const next = {}
        for (const ref of refs) next[ref] = response.value?.[ref]?.configured === true
        setKeyMap(next)
      }, [credentials])

      React.useEffect(() => {
        if (snap.status === 'ready') void refreshKeys(providers)
      }, [snap.status, snap.revision])

      function startEdit(row) {
        setCreating(false)
        setOpenId(row.id)
        setDraft({ ...row, models: row.models.length ? row.models.map((m) => ({ ...m })) : [newModel()] })
        setKeyDraft('')
        setError('')
        setSaved(false)
      }

      function startCreate() {
        setCreating(true)
        setOpenId('__new__')
        setDraft({
          id: '',
          name: '',
          baseUrl: '',
          apiFormat: 'openai-images',
          apiKeyEnv: '',
          models: [newModel()],
        })
        setKeyDraft('')
        setError('')
        setSaved(false)
      }

      function validate(next) {
        if (!String(next.name ?? '').trim()) return t('nameRequired')
        if (!String(next.baseUrl ?? '').trim()) return t('baseUrlRequired')
        const models = (next.models ?? []).map((m) => ({ id: String(m.id).trim(), name: String(m.name ?? '').trim() }))
          .filter((m) => m.id || m.name)
        if (models.length === 0) return t('modelRequired')
        const ids = new Set()
        for (const model of models) {
          if (!model.id) return t('modelIdRequired')
          if (ids.has(model.id)) return t('modelIdDuplicate')
          ids.add(model.id)
        }
        return ''
      }

      async function save() {
        const next = draft
        const message = validate(next)
        if (message) {
          setError(message)
          return
        }
        const models = next.models
          .map((m) => ({ id: String(m.id).trim(), name: String(m.name ?? '').trim() || String(m.id).trim() }))
          .filter((m) => m.id)
        const taken = new Set(providers.map((row) => row.id))
        const id = creating ? uniqueId(next.name, taken) : next.id
        const apiKeyEnv = next.apiKeyEnv || apiKeyEnvFor(id)
        const record = {
          id,
          name: String(next.name).trim(),
          baseUrl: String(next.baseUrl).trim(),
          apiFormat: next.apiFormat || 'openai-images',
          apiKeyEnv,
          models,
        }
        const list = creating
          ? [...providers, record]
          : providers.map((row) => row.id === id ? record : row)
        setBusy(true)
        setError('')
        setSaved(false)
        try {
          await scope.set('providers', list)
          const landed = cloneProviders(scope.getSnapshot().value)
          if (!landed.some((row) => row.id === id && row.baseUrl === record.baseUrl)) {
            throw new Error(t('saveFailed'))
          }
          const key = keyDraft.trim()
          if (key && credentials) {
            const result = await credentials.set(apiKeyEnv, key)
            if (result && result.ok === false) throw new Error(result.error?.message || t('saveFailed'))
            setKeyDraft('')
          }
          await refreshKeys(list)
          setCreating(false)
          setOpenId(null)
          setDraft(null)
          setKeyDraft('')
          setSaved(false)
        } catch (err) {
          setError(String(err?.message || t('saveFailed')))
        } finally {
          setBusy(false)
        }
      }

      async function remove(id) {
        setBusy(true)
        setError('')
        try {
          await scope.set('providers', providers.filter((row) => row.id !== id))
          setOpenId(null)
          setDraft(null)
          setCreating(false)
        } catch (err) {
          setError(String(err?.message || t('saveFailed')))
        } finally {
          setBusy(false)
        }
      }

      if (snap.status === 'loading' || snap.status === 'idle') {
        return React.createElement('div', { style: css.section },
          React.createElement('h2', { style: css.title }, t('title')),
          React.createElement('p', { style: css.intro }, t('intro')),
        )
      }
      if (snap.status === 'unavailable') {
        return React.createElement('div', { style: css.section },
          React.createElement('h2', { style: css.title }, t('title')),
          React.createElement('p', { style: css.error }, t('loadFailed')),
        )
      }

      return React.createElement('div', { style: css.section },
        React.createElement('h2', { style: css.title }, t('title')),
        React.createElement('p', { style: css.intro }, t('intro')),
        !writable ? React.createElement('p', { style: css.meta }, t('readOnly')) : null,
        providers.length === 0 && !creating ? React.createElement('p', { style: css.meta }, t('empty')) : null,
        providers.map((row) => React.createElement('div', { key: row.id, style: css.card },
          openId === row.id && !creating && draft
            ? React.createElement(ProviderEditor, {
              t, draft, setDraft, keyDraft, setKeyDraft,
              keyState: keyMap[draft.apiKeyEnv] === true,
              busy, error, saved, writable, onSave: save,
              onCancel: () => { setOpenId(null); setDraft(null); setError(''); setSaved(false) },
              onDelete: () => remove(row.id),
            })
            : React.createElement(React.Fragment, null,
              React.createElement('div', { style: css.row },
                React.createElement('div', { style: css.name }, row.name || row.id),
                React.createElement('button', {
                  type: 'button', style: css.button, disabled: busy, onClick: () => startEdit(row),
                }, t('edit')),
                React.createElement(IconButton, {
                  label: t('delete'), disabled: !writable || busy, onClick: () => remove(row.id),
                }, IconTrash ? React.createElement(IconTrash, { size: 16 }) : t('delete')),
              ),
              React.createElement('p', { style: css.meta },
                `${row.baseUrl || '—'} · ${formatLabel(row.apiFormat)} · ${row.models.length} models`
                + (keyMap[row.apiKeyEnv] ? ` · ${t('apiKeySet')}` : ` · ${t('apiKeyUnset')}`),
              ),
            ),
        )),
        creating && draft ? React.createElement('div', { style: css.card },
          React.createElement(ProviderEditor, {
            t, draft, setDraft, keyDraft, setKeyDraft,
            keyState: false, busy, error, saved, writable, onSave: save,
            onCancel: () => { setCreating(false); setOpenId(null); setDraft(null); setError('') },
            onDelete: () => { setCreating(false); setOpenId(null); setDraft(null) },
          }),
        ) : null,
        React.createElement('button', {
          type: 'button', style: { ...css.button, alignSelf: 'flex-start', gap: 4 },
          disabled: !writable || creating, onClick: startCreate,
        },
          IconPlus ? React.createElement(IconPlus, { size: 14 }) : null,
          t('addProvider'),
        ),
      )
    }

    function RuntimeCard(props) {
      const t = props.t ?? translateFactory(en)
      const runtime = props.runtime
      const catalog = props.catalog
      const runtimeSnap = useSnapshot(runtime)
      const catalogSnap = useSnapshot(catalog)
      const [open, setOpen] = React.useState(false)
      const [enabled, setEnabled] = React.useState(true)
      const [choice, setChoice] = React.useState('')
      const [size, setSize] = React.useState('1024x1024')
      const [quality, setQuality] = React.useState('auto')
      const [cliOutDir, setCliOutDir] = React.useState('C:/dsh/generate/image')
      const [cliTimeoutMs, setCliTimeoutMs] = React.useState(180000)
      const [lane, setLane] = React.useState('auto')
      const [busy, setBusy] = React.useState(false)
      const [failed, setFailed] = React.useState(false)
      const [dirty, setDirty] = React.useState(false)

      const providers = cloneProviders(catalogSnap.value)
      const options = []
      for (const provider of providers) {
        for (const model of provider.models) {
          options.push({
            value: `${provider.id}::${model.id}`,
            label: `${provider.name} / ${model.name || model.id}`,
          })
        }
      }

      React.useEffect(() => {
        if (dirty) return
        const value = runtimeSnap.value ?? {}
        setEnabled(value.enabled !== false)
        setChoice(value.providerId && value.modelId ? `${value.providerId}::${value.modelId}` : '')
        setSize(value.defaultSize || '1024x1024')
        setQuality(value.defaultQuality || 'auto')
        setCliOutDir(value.cliOutDir || 'C:/dsh/generate/image')
        setCliTimeoutMs(Number(value.cliTimeoutMs) || 180000)
        setLane(value.imageLane || 'auto')
      }, [runtimeSnap.revision, dirty])

      if (runtimeSnap.status !== 'ready') return null
      const writable = runtimeSnap.writable !== false

      async function save() {
        const [providerId, modelId] = choice.includes('::') ? choice.split('::') : ['', '']
        setBusy(true)
        setFailed(false)
        try {
          await runtime.mutate([
            { op: 'set', path: ['enabled'], value: enabled },
            { op: 'set', path: ['providerId'], value: providerId || '' },
            { op: 'set', path: ['modelId'], value: modelId || '' },
            { op: 'set', path: ['defaultSize'], value: size },
            { op: 'set', path: ['defaultQuality'], value: quality },
            { op: 'set', path: ['cliOutDir'], value: cliOutDir },
            { op: 'set', path: ['cliTimeoutMs'], value: Number(cliTimeoutMs) || 180000 },
            { op: 'set', path: ['imageLane'], value: lane },
          ])
          const landed = runtime.getSnapshot().value
          if (landed?.enabled !== enabled || (landed?.providerId || '') !== (providerId || '') || (landed?.modelId || '') !== (modelId || '')) {
            setFailed(true)
            return
          }
          // 保存成功后把解析后的生效配置同步给快车道 CLI（best-effort）
          try { await IMAGE_RPC?.call(RPC_CHANNEL, 'sync-cli-config', {}) } catch { /* mirror sync is best-effort */ }
          setDirty(false)
          setOpen(false)
        } catch {
          setFailed(true)
        } finally {
          setBusy(false)
        }
      }

      function discard() {
        setDirty(false)
        setFailed(false)
        const value = runtimeSnap.value ?? {}
        setEnabled(value.enabled !== false)
        setChoice(value.providerId && value.modelId ? `${value.providerId}::${value.modelId}` : '')
        setSize(value.defaultSize || '1024x1024')
        setQuality(value.defaultQuality || 'auto')
        setCliOutDir(value.cliOutDir || 'C:/dsh/generate/image')
        setCliTimeoutMs(Number(value.cliTimeoutMs) || 180000)
        setLane(value.imageLane || 'auto')
      }

      return React.createElement('li', { style: css.pluginCard },
        React.createElement('button', {
          type: 'button', style: css.pluginHeader, 'aria-expanded': open,
          'aria-label': `${t(open ? 'collapse' : 'expand')}: ${t('cardTitle')}`,
          onClick: () => setOpen(!open),
        },
          React.createElement('span', { style: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 } },
            React.createElement('span', { style: css.pluginName }, t('cardTitle')),
            React.createElement('span', { style: css.pluginDesc }, t('cardDescription')),
          ),
          dirty ? React.createElement('span', { style: { ...css.meta, padding: '1px 8px', borderRadius: 999, background: 'var(--dsw-alias-bg-module-platform)' } }, t('unsaved')) : null,
          React.createElement('span', { style: { color: 'var(--dsw-alias-label-tertiary)', display: 'inline-flex' } },
            open
              ? (IconChevronUp ? React.createElement(IconChevronUp, { size: 14 }) : t('collapse'))
              : (IconChevronDown ? React.createElement(IconChevronDown, { size: 14 }) : t('expand')),
          ),
        ),
        open ? React.createElement('div', { style: css.pluginBody },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', gap: 16 } },
            React.createElement('span', { style: { fontSize: 13 } }, t('enabled')),
            React.createElement('button', {
              type: 'button', role: 'switch', 'aria-checked': enabled,
              style: { ...css.switch, background: enabled ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l3)' },
              disabled: !writable || busy,
              onClick: () => { setEnabled(!enabled); setDirty(true) },
            }, React.createElement('span', {
              style: {
                display: 'block', width: 16, height: 16, borderRadius: '50%',
                background: 'var(--dsw-alias-label-primary-foreground, #fff)',
                transform: enabled ? 'translateX(16px)' : 'none',
              },
            })),
          ),
          React.createElement('p', { style: css.meta }, t('enabledHint')),
          options.length === 0
            ? React.createElement('p', { style: { ...css.meta, padding: '8px 0' } }, t('noModels'))
            : React.createElement(PrefRow, {
              label: t('pickModel'),
              value: choice,
              disabled: !writable || busy,
              placeholder: '—',
              options: [{ id: '', label: '—' }, ...options.map((row) => ({ id: row.value, label: row.label }))],
              onPick: (id) => { setChoice(id); setDirty(true) },
            }),
          options.length === 0 ? null : React.createElement('p', { style: css.meta }, t('pickHint')),
          React.createElement(PrefRow, {
            label: t('defaultSize'),
            value: size,
            disabled: !writable || busy,
            options: ['1024x1024', '1024x1536', '1536x1024', 'auto'].map((value) => ({ id: value, label: value })),
            onPick: (id) => { setSize(id); setDirty(true) },
          }),
          React.createElement(PrefRow, {
            label: t('defaultQuality'),
            value: quality,
            disabled: !writable || busy,
            options: ['low', 'medium', 'high', 'auto'].map((value) => ({ id: value, label: value })),
            onPick: (id) => { setQuality(id); setDirty(true) },
          }),
          React.createElement(PrefRow, {
            label: t('lane'),
            value: lane,
            disabled: !writable || busy,
            options: ['auto', 'cli', 'tool', 'subagent'].map((value) => ({ id: value, label: t(`lane_${value}`) })),
            onPick: (id) => { setLane(id); setDirty(true) },
          }),
          React.createElement('p', { style: css.meta }, t('laneHint')),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', gap: 16 } },
            React.createElement('span', { style: { fontSize: 13 } }, t('cliOutDir')),
            React.createElement('input', {
              style: { ...css.input, maxWidth: 340 }, value: cliOutDir,
              disabled: !writable || busy, 'aria-label': t('cliOutDir'),
              onChange: (event) => { setCliOutDir(event.target.value); setDirty(true) },
            }),
          ),
          React.createElement('p', { style: css.meta }, t('cliOutDirHint')),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', gap: 16 } },
            React.createElement('span', { style: { fontSize: 13 } }, t('cliTimeout')),
            React.createElement('input', {
              style: { ...css.input, maxWidth: 120 }, type: 'number', min: 10000, step: 10000,
              value: String(cliTimeoutMs),
              disabled: !writable || busy, 'aria-label': t('cliTimeout'),
              onChange: (event) => { setCliTimeoutMs(Number(event.target.value) || 180000); setDirty(true) },
            }),
          ),
          React.createElement('p', { style: css.meta }, t('cliTimeoutHint')),
          failed ? React.createElement('p', { style: css.error }, t('saveFailed')) : null,
          React.createElement('div', { style: { ...css.actions, padding: '12px 0 4px' } },
            React.createElement('button', { type: 'button', style: css.button, disabled: !dirty || busy, onClick: discard }, t('discard')),
            React.createElement('button', {
              type: 'button', style: css.primary, disabled: !dirty || busy, onClick: save,
            }, busy ? t('saving') : t('save')),
          ),
        ) : null,
      )
    }

    function ImageLightbox({ src, alt, labels, onClose }) {
      React.useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])
      return React.createElement('div', {
        role: 'dialog', 'aria-label': labels.dialog,
        style: {
          position: 'fixed', inset: 0, zIndex: 10000, display: 'grid', placeItems: 'center',
          background: 'rgba(0,0,0,.72)', padding: 24,
        },
        onClick: onClose,
      },
        React.createElement('img', {
          src, alt, style: { maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 4 },
          onClick: (event) => event.stopPropagation(),
        }),
        React.createElement('button', {
          type: 'button', 'aria-label': labels.close,
          style: {
            position: 'absolute', top: 12, right: 12, width: 32, height: 32, border: 'none',
            borderRadius: '50%', cursor: 'pointer', background: 'rgba(255,255,255,.16)', color: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          },
          onClick: onClose,
        }, IconClose ? React.createElement(IconClose, { size: 16 }) : labels.close),
      )
    }

    function MessageImage({ image, load, cwd, labels }) {
      const [src, setSrc] = React.useState(null)
      const [error, setError] = React.useState(false)
      const [open, setOpen] = React.useState(false)
      const [tick, setTick] = React.useState(0)
      const key = image?.attachment?.attachmentId ?? image?.path ?? ''
      React.useEffect(() => {
        let cancelled = false
        setError(false)
        setSrc(null)
        Promise.resolve(load(image, cwd)).then((url) => {
          if (!cancelled) setSrc(url)
        }, () => {
          if (!cancelled) setError(true)
        })
        return () => { cancelled = true }
      }, [key, load, cwd, tick])
      if (error) {
        return React.createElement('button', {
          type: 'button', style: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' },
          onClick: () => { setError(false); setTick((n) => n + 1) },
        }, labels.loadFailed)
      }
      if (!src) return React.createElement('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, labels.loading)
      return React.createElement(React.Fragment, null,
        React.createElement('button', {
          type: 'button',
          style: {
            display: 'grid', placeItems: 'center', overflow: 'hidden', padding: 0, borderRadius: 8,
            border: '1px solid var(--dsw-alias-border-l2)', cursor: 'zoom-in', width: 240, maxWidth: '100%',
          },
          onClick: () => setOpen(true), 'aria-label': labels.open,
        }, React.createElement('img', { src, alt: labels.image, style: { width: '100%', display: 'block' } })),
        open ? React.createElement(ImageLightbox, { src, alt: labels.image, labels, onClose: () => setOpen(false) }) : null,
      )
    }

    function derivePrompt(argsRaw) {
      let parsed
      try { parsed = JSON.parse(argsRaw) } catch { parsed = undefined }
      let prompt
      if (typeof parsed === 'object' && parsed !== null && typeof parsed.prompt === 'string') prompt = parsed.prompt
      const line = String(prompt ?? argsRaw).split('\n', 1)[0] ?? ''
      return line.length > 60 ? `${line.slice(0, 59)}…` : line
    }

    function resultImages(block) {
      if (!block || !('kind' in block)) return []
      const images = []
      for (const part of block.content ?? []) {
        if (part.type === 'image' && part.attachment) images.push({ attachment: part.attachment })
      }
      if (images.length > 0) return images
      const text = resultText(block)
      for (const line of text.split('\n')) {
        const match = line.match(/^\s*-\s+(\S+\.(?:png|jpe?g|webp|gif))\s*$/i)
        if (match) images.push({ path: match[1] })
      }
      return images
    }

    function resultText(block) {
      if (!block || !('kind' in block)) return ''
      const parts = []
      for (const part of block.content ?? []) if (part.type === 'text') parts.push(part.text)
      if (parts.length === 0 && block.error) parts.push(`${block.error.name}: ${block.error.code}`)
      return parts.join('\n')
    }

    function ImageGenerateToolview(props) {
      const { block } = props
      const t = props.t ?? translateFactory(en)
      if (block === undefined) return null
      // DSH >= 0.1.7 hands explicit phases (preparing/start/result) and an
      // owner-provided session-authorized image loader; older runtimes
      // discriminate the node by its `kind` field and use the injected loader.
      const phase = typeof props.phase === 'string' ? props.phase : ('kind' in block ? 'result' : 'start')
      const settled = phase === 'result'
      const argsRaw = (settled ? block.call?.argsRaw : block.argsRaw) ?? ''
      const title = `image_generate: ${derivePrompt(argsRaw)}`
      const images = resultImages(block)
      const text = settled ? resultText(block) : ''
      const load = (image, cwd) => {
        if (image?.attachment && typeof props.loadImage === 'function') {
          return Promise.resolve(props.loadImage(image.attachment))
        }
        if (typeof props.load === 'function') return props.load(image, cwd)
        return Promise.reject(new Error('no image loader'))
      }
      const Sparkle = IconSparkle
      const labels = {
        image: t('image'),
        open: t('viewImage'),
        loading: t('imageLoading'),
        loadFailed: t('imageLoadFailed'),
        dialog: t('imagePreview'),
        close: t('imageClose'),
      }
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          Sparkle ? React.createElement(Sparkle, { size: 14 }) : null,
          React.createElement('span', {
            style: { fontSize: 13, lineHeight: '20px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          }, title),
        ),
        !settled ? React.createElement('p', { style: css.meta }, t('generating')) : null,
        settled && block.isError && text ? React.createElement('p', { style: css.error }, text.split('\n', 1)[0]) : null,
        settled && !block.isError && images.length > 0 && load
          ? React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
            images.map((image, index) => React.createElement(MessageImage, {
              key: image.attachment?.attachmentId ?? image.path ?? index,
              image,
              load,
              cwd: props.cwd,
              labels,
            })))
          : null,
        settled && !block.isError && images.length === 0 && text
          ? React.createElement('p', { style: { ...css.meta, whiteSpace: 'pre-wrap' } }, text)
          : null,
      )
    }

    async function callImageGen(rpc, endpoint, payload) {
      const result = await rpc.call(RPC_CHANNEL, endpoint, payload)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    }

    function createImageLoader(rpc) {
      return (image, cwd) => {
        const request = image?.attachment
          ? callImageGen(rpc, 'image', { ...image.attachment })
          : callImageGen(rpc, 'file', { path: image?.path, cwd: cwd || '' })
        return request.then((result) => `data:${result.mediaType};base64,${result.dataBase64}`)
      }
    }

    /**
     * Adapt a DSH >= 0.1.6 `configForms` entry form to the settingsScope shape
     * the cards were written against (set(key, value) + mutate(ops)).
     * `pick` projects the merged entry config into one card's section view.
     */
    function adaptConfigForm(form, pick) {
      return {
        getSnapshot() {
          const snap = form.getSnapshot()
          return {
            status: snap.status,
            value: snap.value === undefined ? undefined : pick(snap.value),
            writable: snap.writable,
            revision: snap.revision,
          }
        },
        subscribe: (callback) => form.subscribe(callback),
        set(key, value) {
          return form.mutate([{ op: 'set', path: [key], value }])
        },
        mutate(ops, expectedRevision) {
          return form.mutate(ops, expectedRevision)
        },
      }
    }

    /** Inert scope for runtimes with no settings surface at all. */
    function unavailableScope() {
      return {
        getSnapshot: () => ({ status: 'unavailable', value: undefined, writable: false, revision: undefined }),
        subscribe: () => () => {},
        set: () => Promise.resolve(false),
        mutate: () => Promise.resolve(false),
      }
    }

    /**
     * Bind the catalog/runtime scopes on whichever settings surface this
     * runtime has: DSH <= 0.1.5 serves two `settingsScope` namespaces;
     * DSH >= 0.1.6 serves one merged `configForms` entry (`image-gen`) whose
     * volatile fields carry both.
     */
    function bindScopes(ctx) {
      const settingsScope = ctx.get('settingsScope')
      if (settingsScope && typeof settingsScope.bind === 'function') {
        return {
          legacy: true,
          catalog: settingsScope.bind({ namespace: CATALOG_NS }),
          runtime: settingsScope.bind({ namespace: RUNTIME_NS }),
        }
      }
      const configForms = ctx.get('configForms')
      if (configForms && typeof configForms.get === 'function') {
        const form = configForms.get(CATALOG_NS)
        return {
          legacy: false,
          configForms,
          catalog: adaptConfigForm(form, (value) => ({
            providers: Array.isArray(value?.providers) ? value.providers : [],
          })),
          runtime: adaptConfigForm(form, (value) => ({
            enabled: value?.enabled !== false,
            providerId: value?.providerId ?? '',
            modelId: value?.modelId ?? '',
            defaultSize: value?.defaultSize ?? '1024x1024',
            defaultQuality: value?.defaultQuality ?? 'auto',
            cliOutDir: value?.cliOutDir ?? 'C:/dsh/generate/image',
            cliTimeoutMs: value?.cliTimeoutMs ?? 180000,
            imageLane: value?.imageLane ?? 'auto',
          })),
        }
      }
      return { legacy: true, catalog: unavailableScope(), runtime: unavailableScope() }
    }

    /** plugins.bundle.config page (DSH >= 0.1.6): the runtime picker card. */
    /** 合并的生图设置页：供应商目录卡 + 默认配置卡（原「生图配置」「生图默认」两个导航项）。 */
    function ImageSettingsPage(props) {
      if (props.view === 'summary') return null
      return React.createElement('ul', { style: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 16 } },
        React.createElement(CatalogSection, props),
        React.createElement(RuntimeCard, props))
    }

    function RuntimeBundlePage(props) {
      if (props.view === 'summary') return null
      return React.createElement('ul', { style: { listStyle: 'none', margin: 0, padding: 0 } },
        React.createElement(RuntimeCard, props))
    }

    // 'settingsScope' was removed in DSH 0.1.7 (replaced by 'configForms') and
    // must not be a hard inject, or this client half never activates there.
    const inject = ['slots', 'locale', 'remote', 'remote.credentials', 'connection']

    function apply(ctx) {
      ensureSelectCss()
      ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'dsh-image-generation: copy dictionaries')
      const t = ctx.locale.bind(LOCALE_NS)
      const { legacy, configForms, catalog, runtime } = bindScopes(ctx)
      const connection = ctx.get('connection')
      IMAGE_RPC = connection?.rpc ?? null

      // 合并页：供应商目录卡 + 默认配置卡（单一导航项「生图」）
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'media-image',
        order: 85,
        label: () => t('nav'),
        locale: LOCALE_NS,
        inject: () => ({
          catalog,
          runtime,
          credentials: ctx.remote.credentials,
        }),
      }, ImageSettingsPage))

      if (connection?.rpc) {
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
          name: 'tool.call.toolview',
          key: 'image_generate',
          locale: LOCALE_NS,
          inject: () => ({ load: createImageLoader(connection.rpc) }),
        }, ImageGenerateToolview))
      }
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
    })()
    const videoHalf = (() => {
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
    })()
    const inject = [...new Set([...(imageHalf.inject ?? []), ...(videoHalf.inject ?? [])])]
    return {
      apply(ctx) {
        imageHalf.apply(ctx)
        videoHalf.apply(ctx)
      },
      inject,
    }
  },
})
