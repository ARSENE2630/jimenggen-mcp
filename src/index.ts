#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as crypto from "crypto";
import * as dotenv from "dotenv";
import sharp from "sharp";

// 加载.env文件配置
dotenv.config();

// 火山引擎即梦AI API配置
const ENDPOINT = "https://visual.volcengineapi.com";
const HOST = "visual.volcengineapi.com";
const REGION = "cn-north-1";
const SERVICE = "cv"; // 即梦AI使用cv服务名称,根据火山引擎官方文档

// 环境变量配置
const JIMENG_ACCESS_KEY = process.env.JIMENG_ACCESS_KEY;
const JIMENG_SECRET_KEY = process.env.JIMENG_SECRET_KEY;
const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY;
const SEEDREAM_MODEL_NAME = "doubao-seedream-4-0-250828";
const SEEDREAM_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/images/generations";

// 调试环境变量信息
console.log("🔍 MCP服务器启动 - 环境变量检查:");
console.log("📋 当前环境变量状态:");
console.log("   JIMENG_ACCESS_KEY:", JIMENG_ACCESS_KEY ? "✅ 已设置 (长度:" + JIMENG_ACCESS_KEY.length + ")" : "❌ 未设置");
console.log("   JIMENG_SECRET_KEY:", JIMENG_SECRET_KEY ? "✅ 已设置 (长度:" + JIMENG_SECRET_KEY.length + ")" : "❌ 未设置");

// 检查所有环境变量（调试用）
console.log("🔧 所有环境变量:");
Object.keys(process.env).forEach(key => {
  if (key.includes('JIMENG') || key.includes('ACCESS') || key.includes('SECRET')) {
    console.log(`   ${key}: ${process.env[key] ? '✅ 已设置' : '❌ 未设置'}`);
  }
});

if (!JIMENG_ACCESS_KEY || !JIMENG_SECRET_KEY) {
  console.error("⚠️  警告：未设置环境变量 JIMENG_ACCESS_KEY 和 JIMENG_SECRET_KEY");
  console.error("📝 配置方法：");
  console.error("   1. 设置环境变量：");
  console.error("      Windows: $env:JIMENG_ACCESS_KEY=\"your_key\"; $env:JIMENG_SECRET_KEY=\"your_secret\"");
  console.error("      Linux/Mac: export JIMENG_ACCESS_KEY=\"your_key\"; export JIMENG_SECRET_KEY=\"your_secret\"");
  console.error("   2. 或创建.env文件：");
  console.error("      JIMENG_ACCESS_KEY=your_access_key");
  console.error("      JIMENG_SECRET_KEY=your_secret_key");
  console.error("🔗 服务将启动但无法调用API功能,仅供测试使用");
} else {
  console.log("✅ 环境变量配置正确,API功能可用");
}

// 即梦AI模型映射（仅保留核心功能）
const MODEL_MAPPING: Record<string, string> = {
  "文生图3.1": "jimeng_t2i_v31",        // ✅ 正确的req_key,根据API测试确认
  "图生图3.0": "jimeng_i2i_v30",        // ✅ 正确的req_key,根据API测试确认
  "视频生成3.0 Pro": "jimeng_ti2v_v30_pro", // ✅ 视频生成3.0 Pro
  "图片换装V2": "dressing_diffusionV2",   // ✅ 图片换装V2
  "图片生成4.0": "jimeng_t2i_v40"        // ✅ 图片生成4.0
};

// 接口配置映射（动态Action和Version）
const API_CONFIG_MAPPING: Record<string, { action: string; version: string; resultAction: string; resultVersion: string }> = {
  "文生图3.1": { 
    action: "CVSync2AsyncSubmitTask", 
    version: "2022-08-31",
    resultAction: "CVSync2AsyncGetResult", 
    resultVersion: "2022-08-31" 
  },      // 文生图3.1
  "图生图3.0": { 
    action: "CVSync2AsyncSubmitTask", 
    version: "2022-08-31",
    resultAction: "CVSync2AsyncGetResult", 
    resultVersion: "2022-08-31" 
  },      // 图生图3.0
  "视频生成3.0 Pro": { 
    action: "CVSync2AsyncSubmitTask", 
    version: "2022-08-31",
    resultAction: "CVSync2AsyncGetResult", 
    resultVersion: "2022-08-31" 
  },  // 视频生成3.0 Pro
  "图片换装V2": { 
    action: "CVSubmitTask", 
    version: "2022-08-31",
    resultAction: "CVGetResult", 
    resultVersion: "2022-08-31" 
  }, // 图片换装V2
  "图片生成4.0": { 
    action: "CVSync2AsyncSubmitTask",
    version: "2022-08-31",
    resultAction: "CVSync2AsyncGetResult", 
    resultVersion: "2022-08-31" 
  } // 图片生成4.0
};

// 风格映射
const STYLE_MAPPING: Record<string, string> = {
  "写实": "realistic",
  "国潮": "chinese_trendy", 
  "赛博朋克": "cyberpunk",
  "简约": "minimalist",
  "卡通": "cartoon",
  "油画": "oil_painting",
  "水彩": "watercolor",
  "素描": "sketch"
};

// 辅助函数：生成签名密钥
function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
  const kDate = crypto.createHmac('sha256', key).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('request').digest();
  return kSigning;
}

// 格式化查询参数
function formatQuery(parameters: Record<string, string>): string {
  const sortedKeys = Object.keys(parameters).sort();
  return sortedKeys.map(key => `${key}=${parameters[key]}`).join('&');
}

// 火山引擎V4签名算法
function signV4Request(
  accessKey: string,
  secretKey: string,
  service: string,
  reqQuery: string,
  reqBody: string
): { headers: Record<string, string>; requestUrl: string } {
  const t = new Date();
  const currentDate = t.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const datestamp = currentDate.substring(0, 8);
  
  const method = 'POST';
  const canonicalUri = '/';
  const canonicalQuerystring = reqQuery;
  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const payloadHash = crypto.createHash('sha256').update(reqBody).digest('hex');
  const contentType = 'application/json';
  
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${HOST}`,
    `x-content-sha256:${payloadHash}`,
    `x-date:${currentDate}`
  ].join('\n') + '\n';
  
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  const algorithm = 'HMAC-SHA256';
  const credentialScope = `${datestamp}/${REGION}/${service}/request`;
  const stringToSign = [
    algorithm,
    currentDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');
  
  const signingKey = getSignatureKey(secretKey, datestamp, REGION, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  
  const authorizationHeader = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  const headers = {
    'X-Date': currentDate,
    'Authorization': authorizationHeader,
    'X-Content-Sha256': payloadHash,
    'Content-Type': contentType
  };
  
  const requestUrl = `${ENDPOINT}?${canonicalQuerystring}`;
  
  return { headers, requestUrl };
}

// 生成视频配置
function generateVideoConfig(frames: number,aspect_ratio: string): any {
  return {
      frames: 121,
      aspect_ratio: '16:9'
    };
}

// 生成数字人配置
function generateDigitalHumanConfig(avatarStyle: string, emotion: string, action: string): any {
  return {
    avatar_style: avatarStyle,
    emotion: emotion,
    action: action
  };
}

// 将图片路径转换为base64格式（支持本地文件路径和HTTP URL）
async function imagePathToBase64(imagePath: string): Promise<string> {
  try {
    // 检查是否为本地文件路径（包含盘符或相对路径）
    if (imagePath.includes(':/') || imagePath.includes('\\') || imagePath.startsWith('./') || imagePath.startsWith('../')) {
      // 本地文件路径,使用fs读取
      const fs = await import('fs');
      const buffer = fs.readFileSync(imagePath);
      const base64 = buffer.toString('base64');
      return base64;
    } else {
      // HTTP URL,使用fetch获取
      const response = await fetch(imagePath);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      return base64;
    }
  } catch (error) {
    console.error("图片转base64失败:", error);
    throw error;
  }
}


// 读取文件并转换为base64（使用sharp库适配各种图片格式）
async function readFileAsBase64(filePath: string): Promise<string> {
  try {
    // 使用sharp读取图片文件
    const imageBuffer = await sharp(filePath)
      .jpeg({ quality: 90 }) // 转换为JPEG格式,质量90%
      .toBuffer();
    
    // 转换为base64字符串
    const base64 = imageBuffer.toString('base64');
    return base64;
  } catch (error) {
    console.error(`处理图片文件时出错: ${filePath}`, error);
    throw error;
  }
}

// 将文件缓冲区转换为base64编码
async function base64Encode(fileBuffer: Buffer): Promise<string> {
  return fileBuffer.toString('base64');
}



// 图片换装专用函数（完整实现）
async function callDressingAPI(
  modelImageUrl: string,
  garmentImageUrl: string,
  prompt?: string,
  options?: {
    garmentType?: 'upper' | 'bottom' | 'full',
    keepHead?: boolean,
    keepHand?: boolean,
    keepFoot?: boolean,
    doSuperResolution?: boolean,
    reqImageStoreType?: number,
    binaryDataBase64?: string
  }
): Promise<string | null> {
  try {
    const modelName = '图片换装V2';
    
    // 根据模型名称获取对应的模型ID
    const modelId = MODEL_MAPPING[modelName];
    if (!modelId) {
      throw new Error(`不支持的模型类型: ${modelName}`);
    }

    // 根据模型名称获取对应的接口配置
    const apiConfig = API_CONFIG_MAPPING[modelName];
    if (!apiConfig) {
      throw new Error(`不支持的模型类型: ${modelName}`);
    }

    // 构建请求参数
    const params: any = {
      prompt: prompt || '将服装自然地穿在模特身上',
      return_url: true
    };

    // 设置图片换装特定参数
    if (options) {
      if (options.garmentType) params.garment_type = options.garmentType;
      if (options.keepHead !== undefined) params.keep_head = options.keepHead;
      if (options.keepHand !== undefined) params.keep_hand = options.keepHand;
      if (options.keepFoot !== undefined) params.keep_foot = options.keepFoot;
      if (options.doSuperResolution !== undefined) params.do_super_resolution = options.doSuperResolution;
    }

    // 设置图片上传方式
    const reqImageStoreType = options?.reqImageStoreType ?? 1;
    
    if (reqImageStoreType == 0) {
      // 使用base64方式上传图片
      if (options?.binaryDataBase64) {
        params.binary_data_base64 = JSON.parse(options.binaryDataBase64); // 直接传入base64字符串
      } else {
        throw new Error('使用base64方式上传图片时,需要提供binaryDataBase64参数');
      }
      params.garment = { data: [{type: options?.garmentType || 'full' }] };
    } else {
      // 使用URL方式上传图片
      params.model = { url: modelImageUrl };
      params.garment = { data: [{ url: garmentImageUrl, type: options?.garmentType || 'full' }] };
    }

    params.req_image_store_type = reqImageStoreType;
    debugger;
    params.req_key = 'dressing_diffusionV2';

    // 第一步：提交任务
    const taskId = await submitTask(
      modelId, 
      params, // 直接传入完整的params对象
      apiConfig
    );
    
    if (!taskId) {
      throw new Error("任务提交失败");
    }
    
    // 第二步：轮询查询任务结果
    const result = await queryTaskResultWithPolling(taskId, modelId);
    
    return result;
  } catch (error) {
    console.error("调用图片换装API时出错:", error);
    return null;
  }
}

// 调用即梦AI API（支持动态Action和Version,采用任务提交+轮询查询方式）
async function callJimengAPI(
  modelName: string, 
  prompt: string, 
  ratio?: { width: number; height: number },
  style?: string,
  imageUrl?: string,
  videoConfig?: any,
  binaryDataBase64?: string,
  reqImageStoreType?: string,
  scale?: number
): Promise<string | null> {
  // 根据模型名称获取对应的模型ID
  const modelId = MODEL_MAPPING[modelName];
  if (!modelId) {
    throw new Error(`不支持的模型类型: ${modelName}`);
  }

  // 根据模型名称获取对应的接口配置
  const apiConfig = API_CONFIG_MAPPING[modelName];
  if (!apiConfig) {
    throw new Error(`不支持的模型类型: ${modelName}`);
  }

  // 构建请求参数
  const params: any = {
    prompt: prompt,
    return_url: true
  };

  // 根据模型类型设置特定参数
  if (ratio) {
    params.width = ratio.width;
    params.height = ratio.height;
  }

  if (style && STYLE_MAPPING[style]) {
    params.style = STYLE_MAPPING[style];
  }

  if (imageUrl && modelId !== 'jimeng_t2i_v40') {
    params.image_urls = [imageUrl];
  } else {
    params.image_urls = JSON.parse(imageUrl || '[]');
    params.scale = scale || 0.5;
  }

  if (binaryDataBase64) {
    params.binary_data_base64 = JSON.parse(binaryDataBase64);
  }

  if (reqImageStoreType) {
    params.req_image_store_type = reqImageStoreType;
  }

  if (videoConfig) {
    params.video_config = videoConfig;
  }

  // 第一步：提交任务
  const taskId = await submitTask(modelId, params, apiConfig);
  if (!taskId) {
    return null;
  }

  // 第二步：轮询查询任务结果
  return await queryTaskResultWithPolling(taskId, modelId);
}

// 直接调用火山引擎大模型API的函数
async function callSeeddream4API(
  prompt: string,
  imgUrls?: string,
  size?: string
): Promise<string | null> {
  try {
    // Seedream 4.0模型的模型ID
    const modelId = SEEDREAM_MODEL_NAME;
    
    // 构建请求体
    const reqBody: any = {
      model: modelId,
      prompt: prompt,
      size: size || '1024x1024',
      sequential_image_generation: "auto",
      response_format: "url",
      watermark: false,
      optimize_prompt_options:{mode:"standard"}
    };

    // 添加可选参数
    if (imgUrls) {
      reqBody.image = imgUrls;
    }

    // 构建请求URL
    const url = SEEDREAM_ENDPOINT;
    
    // 构建请求头
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SEEDREAM_API_KEY}`
    };
    
    // 发送请求
    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(reqBody)
    });
    
    if (!response.ok) {
      console.error(`API请求失败: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`错误详情: ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    
    // 检查响应数据
    if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
      console.error("API响应格式不正确或没有生成图片");
      return null;
    }
    
    // 返回第一张图片的URL
    return data.data[0].url || null;
  } catch (error) {
    console.error("调用Seedream 4.0 API失败:", error);
    return null;
  }
}

// 提交任务
async function submitTask(
  model: string,
  params: any,
  apiConfig?: { action: string; version: string }
): Promise<string | null> {
  if (!apiConfig) {
    throw new Error("缺少API配置");
  }

  // 设置查询参数
  const queryParams = {
    'Action': apiConfig.action,
    'Version': apiConfig.version
  };
  const formattedQuery = formatQuery(queryParams);

  // 合并模型ID到params中
  params.req_key = model;
  
  // 确保返回URL参数存在
  if (!params.return_url) {
    params.return_url = true;
  }

  const formattedBody = JSON.stringify(params);

  try {
    // 生成签名和请求头
    const { headers, requestUrl } = signV4Request(
      JIMENG_ACCESS_KEY!,
      JIMENG_SECRET_KEY!,
      SERVICE,
      formattedQuery,
      formattedBody
    );

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: headers,
      body: formattedBody
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseText = await response.text();
    const cleanedResponse = responseText.replace(/\\u0026/g, "&");
    const result = JSON.parse(cleanedResponse);
    
    // 根据火山引擎即梦AI API响应格式解析结果
    if (result.ResponseMetadata && result.ResponseMetadata.Error) {
      throw new Error(`API error: ${result.ResponseMetadata.Error.Message || 'Unknown error'}`);
    }

    // 返回任务ID
    if (result.data && result.data.task_id) {
      return result.data.task_id;
    }
    
    return null;
  } catch (error) {
    console.error("提交任务时出错:", error);
    return null;
  }
}

// 查询任务结果
async function queryTaskResult(taskId: string, modelId: string): Promise<string | null> {
  // 根据模型ID获取对应的查询配置
  const apiConfig = Object.values(API_CONFIG_MAPPING).find(config => 
    Object.keys(MODEL_MAPPING).some(key => MODEL_MAPPING[key] === modelId)
  );
  
  if (!apiConfig) {
    throw new Error(`找不到模型ID ${modelId} 对应的API配置`);
  }

  const queryParams = {
    'Action': apiConfig.resultAction,
    'Version': apiConfig.resultVersion
  };
  const formattedQuery = formatQuery(queryParams);

  const bodyParams = {
    req_key: modelId,
    task_id: taskId,
    req_json: JSON.stringify({
      return_url: true
    })
  };
  const formattedBody = JSON.stringify(bodyParams);

  try {
    const { headers, requestUrl } = signV4Request(
      JIMENG_ACCESS_KEY!,
      JIMENG_SECRET_KEY!,
      SERVICE,
      formattedQuery,
      formattedBody
    );

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: headers,
      body: formattedBody
    });

    
    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}, response: ${responseText}`);
    }

    const cleanedResponse = responseText.replace(/\\u0026/g, "&");
    const result = JSON.parse(cleanedResponse);
    
    if (result.ResponseMetadata && result.ResponseMetadata.Error) {
      throw new Error(`API error: ${result.ResponseMetadata.Error.Message || 'Unknown error'}`);
    }

    // 检查任务状态
    if (result.data && result.data.status) {
      if (result.data.status === "done") {
        // 根据不同的模型类型返回不同的结果字段
        if (result.data.image_urls && result.data.image_urls.length > 0) {
          return result.data.image_urls; // 图片生成任务
        } else if (result.data.video_url) {
          return result.data.video_url; // 视频生成任务
        } else {
          throw new Error("任务完成但未找到有效的结果URL");
        }
      } else if (result.data.status === "failed") {
        throw new Error(`任务执行失败: ${result.data.error_message || '未知错误'}`);
      } else if (result.data.status === "running") {
        // 任务还在运行中,返回null让轮询机制处理
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.error("查询任务结果时出错:", error);
    return null;
  }
}

// 轮询查询任务结果
async function queryTaskResultWithPolling(taskId: string, modelId: string): Promise<string | null> {
  const maxAttempts = 60; // 最大轮询次数
  const delayMs = 2000; // 每次轮询间隔2秒

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`轮询任务结果 (${attempt}/${maxAttempts}): ${taskId}`);
    
    const result = await queryTaskResult(taskId, modelId);
    
    if (result) {
      return result; // 任务完成,返回结果
    }
    
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  console.error(`任务轮询超时: ${taskId}`);
  return null;
}

// 创建MCP服务器实例
const server = new McpServer({
  name: "jimenggen",
  version: "1.1.2",
});

// 注册文生图工具（支持3.0和3.1版本）
server.tool(
  "text-to-image",
  "使用即梦AI文生图模型生成图片,支持3.0和3.1版本",
  {
    prompt: z.string().describe("图片生成提示词"),
    ratio: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive()
    }).describe("支持自定义生成图像宽高,范围在[512, 2048]内,宽高比在1:3到3:1之间"),
    style: z.enum(["写实", "国潮", "赛博朋克", "简约", "卡通", "油画", "水彩", "素描"]).optional().describe("图片风格")
  },
  async ({ prompt, ratio, style }: { prompt?: string; ratio?: { width: number; height: number }; style?: string; }) => {
    // 检查必需参数是否存在
    if (!prompt || !ratio) {
      return {
        content: [
          {
            type: "text",
            text: "错误：缺少必需参数。请提供prompt和ratio参数。"
          }
        ]
      };
    }

    // 检查API密钥是否配置
    if (!JIMENG_ACCESS_KEY || !JIMENG_SECRET_KEY) {
      return {
        content: [
          {
            type: "text",
            text: "错误：未设置环境变量 JIMENG_ACCESS_KEY 和 JIMENG_SECRET_KEY,无法调用API。"
          }
        ]
      };
    }

    const imageUrl = await callJimengAPI("文生图3.1", prompt, ratio, style, undefined, undefined, undefined, undefined);

    if (!imageUrl) {
      return {
        content: [
          {
            type: "text",
            text: "生成图片失败,请检查网络连接和API密钥配置。"
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `文生图生成成功！\n\n提示词: ${prompt}\n图片比例: ${ratio} (${ratio.width}×${ratio.height})\n${style ? `图片风格: ${style}\n` : ""}图片URL: ${imageUrl}`
        }
      ]
    };
  }
);

// 注册图生图工具
server.tool(
  "image-to-image",
  "使用即梦AI图生图模型基于参考图片生成新图片",
  {
    prompt: z.string().describe("图片编辑提示词"),
    imageUrl: z.string().optional().describe("参考图片的URL（与localPath二选一）"),
    ratio: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive()
    }).describe("支持自定义生成图像宽高,范围在[512, 2016]内"),
    localPath: z.string().optional().describe("参考图片的本地路径（与imageUrl二选一,当用户输入本地文件路径时,必填）")
  },
  async ({ prompt, imageUrl, ratio, localPath }: { prompt?: string; imageUrl?: string; ratio?: { width: number; height: number }; localPath?: string}) => {
    // 检查必需参数是否存在
    if (!prompt || !ratio) {
      return {
        content: [
          {
            type: "text",
            text: "错误：缺少必需参数。请提供prompt和ratio参数。"
          }
        ]
      };
    }
    
    // 检查图片参数
    if (!imageUrl && !localPath) {
      return {
        content: [
          {
            type: "text",
            text: "错误：需要提供imageUrl或localPath参数之一。"
          }
        ]
      };
    }

    // 检查API密钥是否配置
    if (!JIMENG_ACCESS_KEY || !JIMENG_SECRET_KEY) {
      return {
        content: [
          {
            type: "text",
            text: "错误：未设置环境变量 JIMENG_ACCESS_KEY 和 JIMENG_SECRET_KEY,无法调用API。"
          }
        ]
      };
    }
    let base64Array = JSON.stringify([]);
    if (localPath) {
      base64Array = JSON.stringify([await readFileAsBase64(localPath)]);
    }
    const resultUrl = await callJimengAPI("图生图3.0", prompt, ratio, undefined, imageUrl, undefined, base64Array, undefined);

    if (!resultUrl) {
      return {
        content: [
          {
            type: "text",
            text: "图生图生成失败,请检查网络连接和API密钥配置。"
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `图生图生成成功！\n\n模型版本: 图生图3.0\n编辑提示词: ${prompt}\n${imageUrl ? `参考图片: ${imageUrl}\n` : "使用二进制数据\n"}生成图片比例: ${ratio} (${ratio.width}×${ratio.height})\n生成图片URL: ${resultUrl}`
        }
      ]
    };
  }
);

//注册图片生成4.0工具
server.tool(
    "generate-image",
    "使用即梦AI图片生成模型生成图片",
    {
      prompt: z.string().describe("图片生成提示词,支持批量文生图、图生图、图片编辑等,提示词需额外声明输出多少张图片(限制:最多输出6张图片),列如:'生成3张图片:1.小猫,2.小狗,3.老虎'"),
      ratio: z.object({
        width: z.number().int().positive(),
        height: z.number().int().positive()
      }).describe("支持自定义生成图像宽高,宽高乘积范围在[1024*1024, 4096*4096]内,宽高比在[1:16,16:1]之间"),
      imgUrls: z.string().optional().describe("参考图片文件URLs,支持输入0-6张图,传入格式:array of string"),
      uploadFiles: z.array(
            z.object({
                file: z.instanceof(File).describe("本地图片文件对象,需是浏览器环境中的File类型"),
                filename: z.string().describe("文件名（含扩展名,如image1.png）"),
                mimeType: z.string().refine(mime => 
                    ["image/jpeg", "image/png", "image/webp"].includes(mime),
                    { message: "仅支持jpg、png、webp格式的图片" }
                ).describe("文件MIME类型,如image/jpeg、image/png")
            })
        ).max(6).optional().describe("本地上传的参考图片,最多6张,支持jpg、png、webp格式；与imgUrls二选一,若同时存在则优先使用本参数"),
      scale: z.number().positive().describe("文本描述影响的程度,该值越大代表文本描述影响程度越大,且输入图片影响程度越小（精度：支持小数点后两位）,范围在[0.0, 1.0]内")
    },
    async ({ prompt, ratio ,imgUrls,scale,uploadFiles}: { prompt?: string; ratio?: { width: number; height: number };imgUrls?: string; scale?: number; uploadFiles?: { file: File; filename: string; mimeType: string }[] }) => {
      // 检查必需参数是否存在
      if (!prompt || !ratio) {
        return {
          content: [
            {
              type: "text",
              text: "错误：缺少必需参数。请提供prompt和ratio参数。"
            }
          ]
        };
      }

      if (scale && (scale < 0.0 || scale > 1.0)) {
        return {
          content: [
            {
              type: "text",
              text: "错误：scale参数值必须在[0.0, 1.0]范围内。"
            }
          ]
        };
      }

      if (!scale) {
        scale = 0.5;
      }

          // 检查API密钥是否配置
    if (!JIMENG_ACCESS_KEY || !JIMENG_SECRET_KEY) {
      return {
        content: [
          {
            type: "text",
            text: "错误：未设置环境变量 JIMENG_ACCESS_KEY 和 JIMENG_SECRET_KEY,无法调用API。"
          }
        ]
      };
    }

    if (!imgUrls) {
        imgUrls = JSON.stringify([]);
    }
    
    let base64Array = JSON.stringify([]);
    if (uploadFiles && uploadFiles.length > 0) {
        base64Array = JSON.stringify(await Promise.all(uploadFiles.map(async file => await base64Encode(Buffer.from(await file.file.arrayBuffer())))));
    }

    const resultUrl = await callJimengAPI("图片生成4.0", prompt, ratio, undefined, imgUrls, undefined, base64Array, undefined, scale);

    if (!resultUrl) {
      return {
        content: [
          {
            type: "text",
            text: "图片生成失败,请检查网络连接和API密钥配置。"
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `图片生成成功！\n\n模型版本: 图片生成4.0\n编辑提示词: ${prompt}\n生成图片比例: ${ratio} (${ratio.width}×${ratio.height})\n${scale ? `参考比列: ${scale}\n` : ""}生成图片URL: ${resultUrl}`
        }
      ]
    };
  }
);

// 注册视频生成工具
server.tool(
  "generate-video",
  "使用即梦AI视频生成模型生成短视频,需要先创建数字形象",
  {
    prompt: z.string().describe("视频生成提示词:【提示词结构】"+
"1、基础结构：主体 / 背景 / 镜头 + 动作"+
"2、多个镜头连贯叙事：镜头1 + 主体 + 动作1 + 镜头2 + 主体 + 动作2 ..."+
"3、 多个连续动作："+
"时序性的多个连续动作： 主体1 + 运动1 + 运动2"+
"多主体的不同动作：主体1 + 运动1 + 主体2 + 运动2 ..."+
"【提示词词典】"+
"1、运镜"+
"切换：“镜头切换”"+
"平移：“镜头向上/下/左/右移动”"+
"推轨：“镜头拉近/拉远”"+
"环形跟踪：“镜头环绕”、“航拍”、“广角”、“镜头360度旋转”"+
"跟随：“镜头跟随”"+
"固定：“固定镜头”、“镜头静止不动”"+
"聚焦：“镜头特写”"+
"手持：“镜头晃动 / 抖动”、“手持拍摄”、“动态不稳定”"+
"2、程度副词：可以通过程度副词,突出主体动作频率与强度,或者特征,如“快速” 、“大幅度”、“高频率”、“剧烈”、“缓缓”"),
    frames: z.number().describe("生成的总帧数（帧数 = 24 * n + 1,其中n为秒数,支持5s、10s）可选取值：[121, 241]默认值：121"),
    aspect_ratio: z.string().describe("生成视频的长宽比,只在文生视频场景下生效,图生视频场景会根据输入图的长宽比从可选取值中选择最接近的比例生成；可选取值：['16:9', '4:3', '1:1', '3:4', '9:16', '21:9']默认值：'16:9'生成视频长宽与比例的对应关系如下：2176 * 928（21:9）;1920 * 1088（16:9）;1664 * 1248（4:3）;1440 * 1440 （1:1）;1248 * 1664（3:4）;1088 * 1920（9:16）")},
  async ({ prompt, frames, aspect_ratio }: { prompt?: string; frames?: number; aspect_ratio?: string }) => {  
    // 检查必需参数是否存在
    if (!prompt || !frames || !aspect_ratio) {
      return {
        content: [
          {
            type: "text",
            text: "错误：缺少必需参数。请提供prompt、frames和aspect_ratio参数。"
          }
        ]
      };
    }

    // 检查API密钥是否配置
    if (!JIMENG_ACCESS_KEY || !JIMENG_SECRET_KEY) {
      return {
        content: [
          {
            type: "text",
            text: "错误：未设置环境变量 JIMENG_ACCESS_KEY 和 JIMENG_SECRET_KEY,无法调用API。"
          }
        ]
      };
    }
    const modelKey = "视频生成3.0 Pro";


    const videoConfig = generateVideoConfig(frames, aspect_ratio);
    const videoUrl = await callJimengAPI(modelKey, prompt, undefined, undefined, undefined, videoConfig);

    if (!videoUrl) {
      return {
        content: [
          {
            type: "text",
            text: "视频生成失败,请检查网络连接和API密钥配置。"
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `视频生成成功！\n\n视频URL: ${videoUrl}\n\n注意：视频URL有效期为1小时。`
        }
      ]
    };
  }
);

// 注册数字人生成工具
server.tool(
  "generate-digital-human",
  "使用即梦AI数字人模型生成数字人内容",
  {
    prompt: z.string().describe("数字人行为描述"),
    avatarStyle: z.enum(["商务", "休闲", "专业", "创意"]).describe("数字人形象风格"),
    emotion: z.enum(["中性", "开心", "严肃", "友好"]).describe("数字人情感状态"),
    action: z.enum(["站立", "行走", "手势", "说话"]).describe("数字人动作类型")
  },
  async ({ prompt, avatarStyle, emotion, action }: { prompt?: string; avatarStyle?: string; emotion?: string; action?: string }) => {
    // 检查必需参数是否存在
    if (!prompt || !avatarStyle || !emotion || !action) {
      return {
        content: [
          {
            type: "text",
            text: "错误：缺少必需参数。请提供prompt、avatarStyle、emotion和action参数。"
          }
        ]
      };
    }

    // 检查API密钥是否配置
    if (!JIMENG_ACCESS_KEY || !JIMENG_SECRET_KEY) {
      return {
        content: [
          {
            type: "text",
            text: "错误：未设置环境变量 JIMENG_ACCESS_KEY 和 JIMENG_SECRET_KEY,无法调用API。"
          }
        ]
      };
    }

    const modelKey = MODEL_MAPPING["数字人3.0"];
    const humanConfig = generateDigitalHumanConfig(avatarStyle, emotion, action);
    const resultUrl = await callJimengAPI(modelKey, prompt, undefined, undefined, undefined, humanConfig);

    if (!resultUrl) {
      return {
        content: [
          {
            type: "text",
            text: "数字人生成失败,请检查网络连接和API密钥配置。"
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `数字人生成成功！\n\n模型版本: 数字人OmniHuman\n行为描述: ${prompt}\n形象风格: ${avatarStyle}\n情感状态: ${emotion}\n动作类型: ${action}\n生成结果URL: ${resultUrl}`
        }
      ]
    };
  }
);

// 注册动作模仿工具
server.tool(
  "action-imitation",
  "使用即梦AI动作模仿模型模仿特定动作",
  {
    referenceAction: z.string().describe("参考动作描述"),
    targetCharacter: z.string().describe("目标角色描述"),
    style: z.enum(["写实", "卡通", "艺术"]).describe("动作风格")
  },
  async ({ referenceAction, targetCharacter, style }: { referenceAction?: string; targetCharacter?: string; style?: string }) => {
    // 检查必需参数是否存在
    if (!referenceAction || !targetCharacter || !style) {
      return {
        content: [
          {
            type: "text",
            text: "错误：缺少必需参数。请提供referenceAction、targetCharacter和style参数。"
          }
        ]
      };
    }

    // 检查API密钥是否配置
    if (!JIMENG_ACCESS_KEY || !JIMENG_SECRET_KEY) {
      return {
        content: [
          {
            type: "text",
            text: "错误：未设置环境变量 JIMENG_ACCESS_KEY 和 JIMENG_SECRET_KEY,无法调用API。"
          }
        ]
      };
    }

    const modelKey = MODEL_MAPPING["动作模仿DreamActor M1"];
    const prompt = `模仿动作: ${referenceAction}, 目标角色: ${targetCharacter}, 风格: ${style}`;
    const resultUrl = await callJimengAPI(modelKey, prompt);

    if (!resultUrl) {
      return {
        content: [
          {
            type: "text",
            text: "动作模仿生成失败,请检查网络连接和API密钥配置。"
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `动作模仿生成成功！\n\n模型版本: 动作模仿DreamActor M1\n参考动作: ${referenceAction}\n目标角色: ${targetCharacter}\n动作风格: ${style}\n生成结果URL: ${resultUrl}`
        }
      ]
    };
  }
);

// 注册图片换装工具
server.tool(
  "image-dressing",
  "使用即梦AI图片换装模型为模特更换服装",
  {
    modelImageUrl: z.string().optional().describe("模特图片URL（需要清晰的人物主体,与localPathArray二选一）"),
    garmentImageUrl: z.string().optional().describe("服装图片URL（需要清晰的服装主体,与localPathArray二选一）"),
    prompt: z.string().optional().describe("换装提示词,如'将服装自然地穿在模特身上'"),
    garmentType: z.enum(["upper", "bottom", "full"]).optional().describe("服装类型：上衣、下装或全身"),
    keepHead: z.boolean().optional().describe("是否保留头部"),
    keepHand: z.boolean().optional().describe("是否保留手部"),
    keepFoot: z.boolean().optional().describe("是否保留脚部"),
    doSuperResolution: z.boolean().optional().describe("是否进行超分辨率处理"),
    localPathArray: z.string().optional().describe("图片本地路径数组,array类型的json字符串,数组包含第一个为模特图,第二个为服装图（与URL参数二选一,当用户输入本地文件路径时,必填）"),
    reqImageStoreType: z.number().optional().describe("图片存储类型（0:使用localPathArray(本地文件路径), 1:使用图片URL）")
  },
  async ({ modelImageUrl, garmentImageUrl, prompt, garmentType, keepHead, keepHand, keepFoot, doSuperResolution, localPathArray, reqImageStoreType }: { 
    modelImageUrl?: string; 
    garmentImageUrl?: string; 
    prompt?: string; 
    garmentType?: "upper" | "bottom" | "full"; 
    keepHead?: boolean; 
    keepHand?: boolean; 
    keepFoot?: boolean; 
    doSuperResolution?: boolean; 
    localPathArray?: string; 
    reqImageStoreType?: number 
  }) => {
    // 检查必需参数是否存在
    if ((!modelImageUrl || !garmentImageUrl) && (!localPathArray || JSON.parse(localPathArray).length !== 2)) {
      return {
        content: [
          {
            type: "text",
            text: "错误：缺少必需参数。请提供modelImageUrl和garmentImageUrl参数,或提供localPathArray参数（数组长度为2）。"
          }
        ]  
      };
    }

    // 检查API密钥是否配置
    if (!JIMENG_ACCESS_KEY || !JIMENG_SECRET_KEY) {
      return {
        content: [
          {
            type: "text",
            text: "错误：未设置环境变量 JIMENG_ACCESS_KEY 和 JIMENG_SECRET_KEY,无法调用API。"
          }
        ]
      };
    }
    let binaryDataBase64 = JSON.stringify([]);
    if (localPathArray && reqImageStoreType === 0) {
      const localPathArrayBase64 = await Promise.all(JSON.parse(localPathArray).map(async (path: string) => await readFileAsBase64(path)));
      binaryDataBase64 = JSON.stringify(localPathArrayBase64);
      modelImageUrl= '';
      garmentImageUrl= '';
    }


    const resultUrl = await callDressingAPI(modelImageUrl || '', garmentImageUrl || '', prompt, {
      garmentType,
      keepHead,
      keepHand,
      keepFoot,
      doSuperResolution,
      reqImageStoreType,
      binaryDataBase64
    });

    if (!resultUrl) {
      return {
        content: [
          {
            type: "text",
            text: "图片换装失败,请检查网络连接、API密钥配置以及图片URL的有效性。"
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `图片换装成功！\n\n模型版本: 图片换装V2\n${modelImageUrl ? `模特图片: ${modelImageUrl}\n服装图片: ${garmentImageUrl}\n` : "使用本地路径数组\n"}换装提示词: ${prompt || '默认提示词'}\n生成图片URL: ${resultUrl}`
        }
      ]
    };
  }
);

// 注册直接调用火山引擎大模型API的图片生成工具
server.tool(
  "generate-img-seedream4",
  "直接调用火山引擎大模型API生成图片,使用doubao-seedream-4.0模型",
  {
    prompt: z.string().describe("图片生成提示词,描述想要生成的图片内容"),
    imgUrls: z.string().optional().describe("参考图片文件URLs,支持输入0-6张图,传入格式:array of string"),
    size: z.string().optional().describe("图片尺寸,格式为'宽x高',如'1024x1024',默认为'1024x1024',总像素取值范围：[1280x720, 4096x4096] ")
  },
  async ({ prompt, imgUrls, size }: { prompt?: string; imgUrls?: string; size?: string }) => {
    // 检查必需参数是否存在
    if (!prompt) {
      return {
        content: [
          {
            type: "text",
            text: "错误：缺少必需参数。请提供prompt参数。"
          }
        ]
      };
    }

    // 检查API密钥是否配置
    if (!SEEDREAM_API_KEY) {
      return {
        content: [
          {
            type: "text",
            text: "错误：未设置环境变量 SEEDREAM_API_KEY,无法调用API。"
          }
        ]
      };
    }

    // 调用Seedream 4.0 API
    const imageUrl = await callSeeddream4API(prompt, imgUrls, size);

    if (!imageUrl) {
      return {
        content: [
          {
            type: "text",
            text: "图片生成失败,请检查网络连接和API密钥配置。"
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Seedream 4.0图片生成成功！\n\n提示词: ${prompt}\n图片尺寸: ${size || '1024x1024'}\n图片URL: ${imageUrl}`
        }
      ]
    };
  }
);

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("即梦AI全功能MCP服务已启动");
}

main().catch((error) => {
  console.error("启动服务时发生错误:", error);
  process.exit(1);
});