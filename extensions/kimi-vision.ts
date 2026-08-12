/**
 * kimi-vision.ts — 用 kimi CLI 对图片做独立视觉检查。
 *
 * 工具: kimi_visual_check
 * 用途: agent-browser 截图后,用 kimi 模型独立分析截图内容(UI 元素、文字、状态),
 *       作为主模型直接看图之外的交叉验证通道。
 *
 * 安装: pi install git:github.com/kyoubelyu/pi-kimi-vision   (或加 @tag/commit 固定版本)
 * 依赖: 本机已登录的 kimi-code CLI (~/.kimi-code/bin/kimi, OAuth 订阅)
 * 模型: 默认 kimi-code/kimi-for-coding(已验证支持 image_in),可用 kimi-code/k3
 * 环境变量: KIMI_CLI_PATH 可覆盖 kimi 可执行文件路径
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_MODEL = "kimi-code/kimi-for-coding";

/** 解析 kimi CLI 路径:KIMI_CLI_PATH 环境变量 → ~/.kimi-code/bin/kimi → PATH。 */
function resolveKimiBin(): string {
  const explicit = process.env.KIMI_CLI_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const userBin = join(homedir(), ".kimi-code", "bin", "kimi");
  if (existsSync(userBin)) return userBin;
  return "kimi";
}

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

function runKimi(
  bin: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: [join(homedir(), ".kimi-code", "bin"), process.env.PATH ?? ""].join(":"),
      },
      signal,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (err) => resolve({ stdout, stderr: `${stderr}\n${err.message}`.trim(), code: -1 }));
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

/** 从 stream-json 输出里取出所有 assistant 最终回答,拼接为纯文本。 */
function extractAnswer(stdout: string): string {
  const parts: string[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj.role === "assistant" && typeof obj.content === "string" && obj.content.trim()) {
        parts.push(obj.content);
      }
    } catch {
      // 非 JSON 行跳过
    }
  }
  return parts.join("\n").trim();
}

export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kimi_visual_check",
    label: "Kimi Visual Check",
    description:
      "用 kimi CLI 独立分析图片(截图/渲染图/图纸图片)并返回视觉描述,作为主模型看图之外的交叉验证。典型场景:agent-browser 截图后的 FE 视觉检查。",
    parameters: Type.Object({
      imagePath: Type.String({
        description: "要分析图片的绝对路径(如 agent-browser 截图的保存路径)",
      }),
      question: Type.Optional(
        Type.String({
          description: "要问的问题;不填则默认要求详细描述图片内容",
        }),
      ),
      additionalImagePaths: Type.Optional(
        Type.Array(Type.String(), {
          description: "可选的对照图片路径(如改动前后两张截图对比)",
        }),
      ),
      model: Type.Optional(
        Type.String({
          description: `kimi 模型,默认 ${DEFAULT_MODEL};也可用 kimi-code/k3`,
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const imageRefs = [params.imagePath, ...(params.additionalImagePaths ?? [])];
      const missing = imageRefs.filter((p) => !existsSync(p));
      if (missing.length > 0) {
        return {
          isError: true,
          content: [{ type: "text", text: `以下图片不存在: ${missing.join(", ")}` }],
          details: {},
        };
      }

      const question =
        params.question ??
        "详细描述这张图片:布局、界面元素、文字、颜色、状态,以及任何异常之处。";
      const prompt = [
        question,
        "请先读取以下图片文件再回答:",
        ...imageRefs.map((p, i) => `${i + 1}. ${p}`),
        "如果图片读取失败,请直接说明失败原因。",
      ].join("\n");

      const startMs = Date.now();
      const result = await runKimi(
        resolveKimiBin(),
        ["-m", params.model ?? DEFAULT_MODEL, "-p", prompt, "--output-format", "stream-json"],
        ctx.cwd,
        signal,
      );
      const durationMs = Date.now() - startMs;

      if (result.code !== 0) {
        const reason = signal?.aborted ? "已中止" : `kimi 退出码 ${result.code}`;
        return {
          isError: true,
          content: [{ type: "text", text: `Kimi 视觉检查失败(${reason}):\n${result.stderr.trim()}` }],
          details: { model: params.model ?? DEFAULT_MODEL, durationMs },
        };
      }

      const answer = extractAnswer(result.stdout);
      if (!answer) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Kimi 未返回可解析的回答。stderr: ${result.stderr.trim()}\nstdout(前2000字符): ${result.stdout.slice(0, 2000)}`,
            },
          ],
          details: { model: params.model ?? DEFAULT_MODEL, durationMs },
        };
      }

      return {
        content: [{ type: "text", text: answer }],
        details: { model: params.model ?? DEFAULT_MODEL, durationMs, images: imageRefs },
      };
    },
  });
}
