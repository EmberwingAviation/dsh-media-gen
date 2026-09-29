/**
 * dsh-media-gen — 生图 client 半。
 * 复制自 dsh-image-generation@0.1.2 client（MIT © whiteS18，见 ../NOTICE.md），改动：
 * 模块 id 与配置命名空间改指合并 loader 条目 `media-gen`，bundle 配置页 key 改为 dsh-media-gen。
 *
 * - Settings → 生图配置: add/edit image providers and their models
 * - Settings → 插件 → 插件配置 → dsh-media-gen: pick the single model the tool uses
 * - tool.call.toolview for image_generate: inline gallery
 */
window.__ModuleLoader__.load({
  id: 'dsh-media-gen-image',
  factory: (require) => {
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
  },
})
