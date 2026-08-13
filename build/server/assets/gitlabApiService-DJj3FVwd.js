const CACHE_DURATION = 5 * 60 * 1e3;
class GitLabCache {
  _cache = /* @__PURE__ */ new Map();
  set(key, data, duration = CACHE_DURATION) {
    const timestamp = Date.now();
    this._cache.set(key, {
      data,
      timestamp,
      expiresAt: timestamp + duration
    });
  }
  get(key) {
    const entry = this._cache.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      return null;
    }
    return entry.data;
  }
  clear() {
    this._cache.clear();
  }
  isExpired(key) {
    const entry = this._cache.get(key);
    return !entry || Date.now() > entry.expiresAt;
  }
}
const gitlabCache = new GitLabCache();
async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }
      if (response.status >= 500 || response.status === 429) {
        if (attempt === maxRetries) {
          return response;
        }
        const delay = Math.min(1e3 * Math.pow(2, attempt - 1), 1e4);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        throw lastError;
      }
      const delay = Math.min(1e3 * Math.pow(2, attempt - 1), 1e4);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
class GitLabApiService {
  _baseUrl;
  _token;
  constructor(token, baseUrl = "https://gitlab.com") {
    this._token = token;
    this._baseUrl = baseUrl;
  }
  get _headers() {
    console.log("GitLab API token info:", {
      tokenLength: this._token.length,
      tokenPrefix: this._token.substring(0, 10) + "...",
      tokenType: this._token.startsWith("glpat-") ? "personal-access-token" : "unknown"
    });
    return {
      "Content-Type": "application/json",
      "PRIVATE-TOKEN": this._token
    };
  }
  async _request(endpoint, options = {}) {
    const url = `${this._baseUrl}/api/v4${endpoint}`;
    return fetchWithRetry(url, {
      ...options,
      headers: {
        ...this._headers,
        ...options.headers
      }
    });
  }
  async getUser() {
    const response = await this._request("/user");
    if (!response.ok) {
      let errorMessage = `Failed to fetch user: ${response.status}`;
      if (response.status === 401) {
        errorMessage = "401 Unauthorized: Invalid or expired GitLab access token. Please check your token and ensure it has the required scopes (api, read_repository).";
      } else if (response.status === 403) {
        errorMessage = "403 Forbidden: GitLab access token does not have sufficient permissions.";
      } else if (response.status === 404) {
        errorMessage = "404 Not Found: GitLab API endpoint not found. Please check your GitLab URL configuration.";
      } else if (response.status === 429) {
        errorMessage = "429 Too Many Requests: GitLab API rate limit exceeded. Please try again later.";
      }
      try {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage += ` Details: ${errorData.message}`;
        }
      } catch {
      }
      throw new Error(errorMessage);
    }
    const user = await response.json();
    const rateLimit = {
      limit: parseInt(response.headers.get("ratelimit-limit") || "0"),
      remaining: parseInt(response.headers.get("ratelimit-remaining") || "0"),
      reset: parseInt(response.headers.get("ratelimit-reset") || "0")
    };
    const processedUser = {
      ...user,
      avatar_url: user.avatar_url || user.avatarUrl || user.profile_image_url || null
    };
    return { ...processedUser, rateLimit };
  }
  async getProjects(membership = true, minAccessLevel = 20, perPage = 50) {
    const cacheKey = `projects_${this._token}_${membership}_${minAccessLevel}`;
    const cached = gitlabCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    let allProjects = [];
    let page = 1;
    const maxPages = 10;
    while (page <= maxPages) {
      const response = await this._request(
        `/projects?membership=${membership}&min_access_level=${minAccessLevel}&per_page=${perPage}&page=${page}&order_by=updated_at&sort=desc`
      );
      if (!response.ok) {
        let errorMessage = `Failed to fetch projects: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          console.error("GitLab projects API error:", errorData);
          errorMessage = `Failed to fetch projects: ${JSON.stringify(errorData)}`;
        } catch (parseError) {
          console.error("Could not parse GitLab error response:", parseError);
        }
        throw new Error(errorMessage);
      }
      const projects = await response.json();
      if (projects.length === 0) {
        break;
      }
      allProjects = [...allProjects, ...projects];
      if (allProjects.length >= 100) {
        break;
      }
      page++;
    }
    const transformedProjects = allProjects.map((project) => ({
      id: project.id,
      name: project.name,
      path_with_namespace: project.path_with_namespace,
      description: project.description,
      http_url_to_repo: project.http_url_to_repo,
      star_count: project.star_count,
      forks_count: project.forks_count,
      default_branch: project.default_branch,
      updated_at: project.updated_at,
      visibility: project.visibility
    }));
    gitlabCache.set(cacheKey, transformedProjects);
    return transformedProjects;
  }
  async getEvents(perPage = 10) {
    const response = await this._request(`/events?per_page=${perPage}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch events: ${response.statusText}`);
    }
    const events = await response.json();
    return events.slice(0, 5).map((event) => ({
      id: event.id,
      action_name: event.action_name,
      project_id: event.project_id,
      project: event.project,
      created_at: event.created_at
    }));
  }
  async getGroups(minAccessLevel = 10) {
    const response = await this._request(`/groups?min_access_level=${minAccessLevel}`);
    if (response.ok) {
      return await response.json();
    }
    return [];
  }
  async getSnippets() {
    const response = await this._request("/snippets");
    if (response.ok) {
      return await response.json();
    }
    return [];
  }
  async createProject(name, isPrivate = false) {
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_.]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
    const response = await this._request("/projects", {
      method: "POST",
      body: JSON.stringify({
        name: sanitizedName,
        path: sanitizedName,
        // Explicitly set path to match name
        visibility: isPrivate ? "private" : "public",
        initialize_with_readme: false,
        // Don't initialize with README to avoid conflicts
        default_branch: "main",
        // Explicitly set default branch
        description: `Project created from Bolt.diy`
      })
    });
    if (!response.ok) {
      let errorMessage = `Failed to create project: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.message) {
          if (typeof errorData.message === "object") {
            const messages = Object.entries(errorData.message).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`).join("; ");
            errorMessage = `Failed to create project: ${messages}`;
          } else {
            errorMessage = `Failed to create project: ${errorData.message}`;
          }
        }
      } catch (parseError) {
        console.error("Could not parse error response:", parseError);
      }
      throw new Error(errorMessage);
    }
    return await response.json();
  }
  async getProject(owner, name) {
    const response = await this._request(`/projects/${encodeURIComponent(`${owner}/${name}`)}`);
    if (response.ok) {
      return await response.json();
    }
    return null;
  }
  async createBranch(projectId, branchName, ref) {
    const response = await this._request(`/projects/${projectId}/repository/branches`, {
      method: "POST",
      body: JSON.stringify({
        branch: branchName,
        ref
      })
    });
    if (!response.ok) {
      throw new Error(`Failed to create branch: ${response.statusText}`);
    }
    return await response.json();
  }
  async commitFiles(projectId, commitRequest) {
    const response = await this._request(`/projects/${projectId}/repository/commits`, {
      method: "POST",
      body: JSON.stringify(commitRequest)
    });
    if (!response.ok) {
      let errorMessage = `Failed to commit files: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
      }
      throw new Error(errorMessage);
    }
    return await response.json();
  }
  async getFile(projectId, filePath, ref) {
    return this._request(`/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}?ref=${ref}`);
  }
  async getProjectByPath(projectPath) {
    try {
      const encodedPath = encodeURIComponent(projectPath);
      const response = await this._request(`/projects/${encodedPath}`);
      if (response.ok) {
        return await response.json();
      }
      if (response.status === 404) {
        console.log(`Project not found: ${projectPath}`);
        return null;
      }
      const errorText = await response.text();
      console.error(`Failed to fetch project ${projectPath}:`, response.status, errorText);
      throw new Error(`Failed to fetch project: ${response.status} ${response.statusText}`);
    } catch (error) {
      if (error instanceof Error && (error.message.includes("404") || error.message.includes("Not Found"))) {
        return null;
      }
      throw error;
    }
  }
  async updateProjectVisibility(projectId, visibility) {
    const response = await this._request(`/projects/${projectId}`, {
      method: "PUT",
      body: JSON.stringify({ visibility })
    });
    if (!response.ok) {
      throw new Error(`Failed to update project visibility: ${response.status} ${response.statusText}`);
    }
  }
  async createProjectWithFiles(name, isPrivate, files) {
    const project = await this.createProject(name, isPrivate);
    if (Object.keys(files).length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1e3));
      const actions = Object.entries(files).map(([filePath, content]) => ({
        action: "create",
        file_path: filePath,
        content
      }));
      const commitRequest = {
        branch: "main",
        commit_message: "Initial commit from Bolt.diy",
        actions
      };
      try {
        await this.commitFiles(project.id, commitRequest);
      } catch (error) {
        console.error("Failed to commit files to new project:", error);
      }
    }
    return project;
  }
  async updateProjectWithFiles(projectId, files) {
    if (Object.keys(files).length === 0) {
      return;
    }
    const actions = Object.entries(files).map(([filePath, content]) => ({
      action: "create",
      // Start with create, we'll handle conflicts in the API response
      file_path: filePath,
      content
    }));
    const commitRequest = {
      branch: "main",
      commit_message: "Update from Bolt.diy",
      actions
    };
    try {
      await this.commitFiles(projectId, commitRequest);
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        const updateActions = Object.entries(files).map(([filePath, content]) => ({
          action: "update",
          file_path: filePath,
          content
        }));
        const updateCommitRequest = {
          branch: "main",
          commit_message: "Update from Bolt.diy",
          actions: updateActions
        };
        await this.commitFiles(projectId, updateCommitRequest);
      } else {
        throw error;
      }
    }
  }
}

export { GitLabApiService, gitlabCache };
