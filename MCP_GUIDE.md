# 🔌 MCP Resource Guide
> Built by orchestrating 3 MCP servers: Filesystem + Memory + GitHub
> Generated: 2/7/2026, 4:32:49 AM

---

## 📊 Our Project Stats (via Filesystem MCP)
| Metric | Value |
|--------|-------|
| Project | bud-love-tickets v4.0.0 |
| Total Lines | 2348 |
| CSS Lines | ~726 |
| JS Lines | ~182 |

## ⭐ Top MCP Servers (via GitHub MCP)

### wong2/awesome-mcp-servers
- A curated list of Model Context Protocol (MCP) servers
- ⭐ ? stars | 🔤 ?
- 🔗 https://github.com/wong2/awesome-mcp-servers

### appcypher/awesome-mcp-servers
- Awesome MCP Servers - A curated list of Model Context Protocol servers
- ⭐ ? stars | 🔤 ?
- 🔗 https://github.com/appcypher/awesome-mcp-servers

### haris-musa/excel-mcp-server
- A Model Context Protocol server for Excel file manipulation
- ⭐ ? stars | 🔤 ?
- 🔗 https://github.com/haris-musa/excel-mcp-server

### modelcontextprotocol/registry
- A community driven registry service for Model Context Protocol (MCP) servers.
- ⭐ ? stars | 🔤 ?
- 🔗 https://github.com/modelcontextprotocol/registry

### neo4j-contrib/mcp-neo4j
- Neo4j Labs Model Context Protocol servers
- ⭐ ? stars | 🔤 ?
- 🔗 https://github.com/neo4j-contrib/mcp-neo4j

## 🧠 Knowledge Graph (via Memory MCP)
Entities stored: 1

### appcypher/awesome-mcp-servers (MCPResource)
- Awesome MCP Servers - A curated list of Model Context Protocol servers
- Stars: ?
- URL: https://github.com/appcypher/awesome-mcp-servers

---

## 🔌 How This Was Built
```
Server 1: @modelcontextprotocol/server-filesystem → read project files
Server 2: @modelcontextprotocol/server-memory → persistent knowledge graph
Server 3: @modelcontextprotocol/server-github → searched GitHub repos

Workflow: GitHub(search) → Memory(store) → Filesystem(read) → Memory(query) → Filesystem(write)
```

*Each arrow = a different MCP server doing real work.*
