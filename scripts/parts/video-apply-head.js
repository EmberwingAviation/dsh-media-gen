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
			const configForms = ctx.get("configForms");
			if (configForms && typeof configForms.whileServed === "function") {
				ctx.effect(() => configForms.whileServed([MEDIA_ENTRY_ID], () =>
					ctx.slots.inject("plugins.bundle.config", () => register({
						name: "plugins.bundle.config",
						key: "dsh-media-gen",
						inject: () => ({ scope, credentials, locale })
					}, VideoSettingsPage))), "dsh-media-gen: video settings page");
			}
