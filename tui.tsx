// @ts-nocheck
/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { PricingProvider } from "./context";
import { PricingSide } from "./pricing-side";

const id = "llm-pricing";

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 60,
    slots: {
      sidebar_content(ctx, props) {
        return (
          <PricingProvider>
            <PricingSide
              theme={ctx.theme.current}
              sessionId={props.session_id}
            />
          </PricingProvider>
        );
      },
    },
  });
};

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
};

export default plugin;
