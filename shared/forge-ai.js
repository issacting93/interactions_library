// A drop-in replacement for the Claude Artifact "sample" capability (`state.sample.json(prompt, opts)`)
// so tools built around that interface also work outside claude.ai, via any OpenAI-compatible chat
// completions endpoint (DeepSeek by default). Config lives only in localStorage, never in source.
window.ForgeAI = (function () {
  const STORE_KEY = "forge:ai-config";

  function getConfig() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
  }
  function setConfig(cfg) {
    localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
  }

  function extractJson(content) {
    const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    return JSON.parse(cleaned);
  }

  // Returns an object shaped like the Claude Artifact "sample" capability: { json(prompt, {signal}) }.
  function createSample(readConfig) {
    return {
      async json(prompt, opts = {}) {
        const cfg = readConfig();
        if (!cfg.apiKey) throw { code: "not_granted" };
        const baseUrl = (cfg.baseUrl || "https://api.deepseek.com").replace(/\/$/, "");
        let res;
        try {
          res = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.apiKey}` },
            signal: opts.signal,
            body: JSON.stringify({
              model: cfg.model || "deepseek-chat",
              messages: [{ role: "user", content: prompt }],
              response_format: { type: "json_object" },
            }),
          });
        } catch (e) {
          throw { code: e.name === "AbortError" ? "cancelled" : "bad" };
        }
        if (res.status === 429) throw { code: "rate_limited" };
        if (res.status === 401 || res.status === 403) throw { code: "not_granted" };
        if (!res.ok) throw { code: "bad" };
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || "";
        try { return extractJson(content); } catch { throw { code: "bad" }; }
      },
    };
  }

  // Mounts a small "AI provider" <details> settings panel into `host`, pre-filled from localStorage.
  // Calls onSave() after a successful save so the caller can re-check config and retry.
  function mountConfigPanel(host, onSave) {
    const cfg = getConfig();
    host.innerHTML = `<details class="forgeai-cfg">
      <summary>AI provider</summary>
      <input type="text" id="forgeaiBase" placeholder="https://api.deepseek.com">
      <input type="text" id="forgeaiModel" placeholder="deepseek-chat">
      <input type="password" id="forgeaiKey" placeholder="API key" autocomplete="off" spellcheck="false">
      <button class="btn small" type="button" id="forgeaiSave">Save</button>
    </details>`;
    host.querySelector("#forgeaiBase").value = cfg.baseUrl || "";
    host.querySelector("#forgeaiModel").value = cfg.model || "";
    host.querySelector("#forgeaiKey").value = cfg.apiKey || "";
    host.querySelector("#forgeaiSave").onclick = () => {
      setConfig({
        baseUrl: host.querySelector("#forgeaiBase").value.trim(),
        model: host.querySelector("#forgeaiModel").value.trim(),
        apiKey: host.querySelector("#forgeaiKey").value.trim(),
      });
      host.querySelector("details").open = false;
      onSave?.();
    };
  }

  return { getConfig, setConfig, createSample, mountConfigPanel };
})();
