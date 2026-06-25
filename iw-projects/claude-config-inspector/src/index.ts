import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { inspect, formatSnapshot } from './inspector.js';

const server = new Server(
  { name: 'claude-config-inspector', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'inspect_config',
      description:
        'Claude Code の現在の構成スナップショットを返す。model / MCP / hooks / CLAUDE.md / skills / memory を一覧化し、改善できる箇所 (gaps) も提示する。',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
            description: '調査するディレクトリ（省略時はカレントディレクトリ）',
          },
        },
      },
    },
    {
      name: 'get_recommendations',
      description:
        'inspect_config の結果をもとに、優先度付きのセットアップ改善提案を返す。',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
            description: '調査するディレクトリ（省略時はカレントディレクトリ）',
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const cwd = (args as Record<string, string>)?.cwd;

  if (name === 'inspect_config') {
    const snapshot = inspect(cwd);
    return {
      content: [{ type: 'text', text: formatSnapshot(snapshot) }],
    };
  }

  if (name === 'get_recommendations') {
    const snapshot = inspect(cwd);
    const recs = buildRecommendations(snapshot.gaps);
    return {
      content: [{ type: 'text', text: recs }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

function buildRecommendations(gaps: string[]): string {
  if (gaps.length === 0) {
    return '✅ 設定は充実しています。特に推奨アクションはありません。';
  }

  const lines = ['# セットアップ改善提案', ''];

  const prioritized = gaps.map((gap, i) => {
    const priority = i < 2 ? '🔴 高' : i < 4 ? '🟡 中' : '🟢 低';
    return `${priority} ${gap}`;
  });

  lines.push(...prioritized);
  lines.push('');
  lines.push('## 参考リソース');
  lines.push('- Claude Code docs: https://docs.anthropic.com/claude-code');
  lines.push('- MCP servers: https://modelcontextprotocol.io/');

  return lines.join('\n');
}

const transport = new StdioServerTransport();
await server.connect(transport);
