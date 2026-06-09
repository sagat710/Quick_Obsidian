/* Minimal GitHub Contents API client for committing Markdown to a vault repo. */
(function (global) {
  "use strict";

  const API = "https://api.github.com";

  // --- UTF-8 safe base64 helpers ---
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function base64ToUtf8(b64) {
    const bin = atob(b64.replace(/\n/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function headers(token) {
    return {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  async function parseError(res) {
    let msg = res.status + " " + res.statusText;
    try {
      const data = await res.json();
      if (data && data.message) msg = data.message;
    } catch (_) {}
    return new Error(msg);
  }

  function encodePath(path) {
    return path
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
  }

  const GitHub = {
    utf8ToBase64,
    base64ToUtf8,

    /** Verify token + repo access. Returns the repo's default branch. */
    async testConnection(cfg) {
      const res = await fetch(`${API}/repos/${cfg.repo}`, {
        headers: headers(cfg.token),
      });
      if (!res.ok) throw await parseError(res);
      const data = await res.json();
      return data.default_branch;
    },

    /** Fetch a file's content + sha, or null if it does not exist (404). */
    async getFile(cfg, path) {
      const url = `${API}/repos/${cfg.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(cfg.branch)}`;
      const res = await fetch(url, { headers: headers(cfg.token) });
      if (res.status === 404) return null;
      if (!res.ok) throw await parseError(res);
      const data = await res.json();
      return { content: base64ToUtf8(data.content || ""), sha: data.sha };
    },

    /** Create or update a file. Pass sha to update an existing file. */
    async putFile(cfg, path, contentStr, message, sha) {
      const body = {
        message,
        content: utf8ToBase64(contentStr),
        branch: cfg.branch,
      };
      if (sha) body.sha = sha;
      const res = await fetch(
        `${API}/repos/${cfg.repo}/contents/${encodePath(path)}`,
        {
          method: "PUT",
          headers: { ...headers(cfg.token), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) throw await parseError(res);
      return res.json();
    },

    /** Create a new note, auto-suffixing the filename if it already exists. */
    async createNote(cfg, path, contentStr, message) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const tryPath =
          attempt === 0 ? path : path.replace(/\.md$/i, `-${attempt}.md`);
        try {
          return await this.putFile(cfg, tryPath, contentStr, message);
        } catch (err) {
          // 422 == path already exists; try a suffixed name
          if (/exist/i.test(err.message) && attempt < 4) continue;
          throw err;
        }
      }
    },

    /** Append text to a file, creating it if missing. Retries once on sha conflict. */
    async appendToFile(cfg, path, textToAppend, message, header) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const existing = await this.getFile(cfg, path);
        let next;
        if (existing) {
          const base = existing.content.replace(/\s*$/, "");
          next = base + "\n" + (header ? header + "\n" : "") + textToAppend + "\n";
        } else {
          next = (header ? header + "\n" : "") + textToAppend + "\n";
        }
        try {
          return await this.putFile(
            cfg,
            path,
            next,
            message,
            existing ? existing.sha : undefined
          );
        } catch (err) {
          // sha conflict -> someone changed the file; reload and retry once
          if (/sha|conflict/i.test(err.message) && attempt === 0) continue;
          throw err;
        }
      }
    },
  };

  global.GitHub = GitHub;
})(window);
