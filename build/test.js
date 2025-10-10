#!/usr/bin/env node
/**
 * 即梦AI接口测试脚本
 * 用于测试文生图3.1、图生图3.0、视频生成3.0 Pro、图片换装V2四个核心接口
 * 提供详细的日志打印，方便了解接口响应是否正常
 */
import { config } from 'dotenv';
import sharp from 'sharp';
// 加载环境变量
config();
// 复制src/index.ts中的配置和函数到测试脚本中
// 火山引擎即梦AI API配置
const ENDPOINT = "https://visual.volcengineapi.com";
const HOST = "visual.volcengineapi.com";
const REGION = "cn-north-1";
const SERVICE = "cv"; // 即梦AI使用cv服务名称，根据火山引擎官方文档
const TEST_IMG_PATH = process.env.TEST_IMG_PATH || "";
const MODEL_IMAGE_PATH = process.env.MODEL_IMAGE_URL || "";
// 环境变量配置
const JIMENG_ACCESS_KEY = process.env.JIMENG_ACCESS_KEY;
const JIMENG_SECRET_KEY = process.env.JIMENG_SECRET_KEY;
// 即梦AI模型映射（仅保留核心功能）
const MODEL_MAPPING = {
    "文生图3.1": "jimeng_t2i_v31", // ✅ 正确的req_key，根据API测试确认
    "图生图3.0": "jimeng_i2i_v30", // ✅ 正确的req_key，根据API测试确认
    "视频生成3.0 Pro": "jimeng_ti2v_v30_pro", // ✅ 视频生成3.0 Pro
    "图片换装V2": "dressing_diffusionV2", // ✅ 图片换装V2
    "图片生成4.0": "jimeng_t2i_v40" // ✅ 图片生成4.0
};
// 接口配置映射（动态Action和Version）
const API_CONFIG_MAPPING = {
    "文生图3.1": {
        action: "CVSync2AsyncSubmitTask",
        version: "2022-08-31",
        resultAction: "CVSync2AsyncGetResult",
        resultVersion: "2022-08-31"
    }, // 文生图3.1
    "图生图3.0": {
        action: "CVSync2AsyncSubmitTask",
        version: "2022-08-31",
        resultAction: "CVSync2AsyncGetResult",
        resultVersion: "2022-08-31"
    }, // 图生图3.0
    "视频生成3.0 Pro": {
        action: "CVSync2AsyncSubmitTask",
        version: "2022-08-31",
        resultAction: "CVSync2AsyncGetResult",
        resultVersion: "2022-08-31"
    }, // 视频生成3.0 Pro
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
const STYLE_MAPPING = {
    "写实": "realistic",
    "国潮": "chinese_trendy",
    "赛博朋克": "cyberpunk",
    "简约": "minimalist",
    "卡通": "cartoon",
    "油画": "oil_painting",
    "水彩": "watercolor",
    "素描": "sketch"
};
// 导入crypto模块用于签名
import * as crypto from 'crypto';
// 读取文件并转换为base64（使用sharp库适配各种图片格式）
async function readFileAsBase64(filePath) {
    try {
        // 使用sharp读取图片文件
        const imageBuffer = await sharp(filePath)
            .jpeg({ quality: 90 }) // 转换为JPEG格式，质量90%
            .toBuffer();
        // 转换为base64字符串
        const base64 = imageBuffer.toString('base64');
        return base64;
    }
    catch (error) {
        console.error(`处理图片文件时出错: ${filePath}`, error);
        throw error;
    }
}
// 日志颜色配置
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};
// 辅助函数：生成签名密钥
function getSignatureKey(key, dateStamp, regionName, serviceName) {
    const kDate = crypto.createHmac('sha256', key).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('request').digest();
    return kSigning;
}
// 格式化查询参数
function formatQuery(parameters) {
    const sortedKeys = Object.keys(parameters).sort();
    return sortedKeys.map(key => `${key}=${parameters[key]}`).join('&');
}
// 火山引擎V4签名算法
function signV4Request(accessKey, secretKey, service, reqQuery, reqBody) {
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
// 查询任务结果
async function queryTaskResult(taskId, modelId) {
    // 根据模型ID获取对应的查询配置
    const apiConfig = Object.values(API_CONFIG_MAPPING).find(config => Object.keys(MODEL_MAPPING).some(key => MODEL_MAPPING[key] === modelId));
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
        const { headers, requestUrl } = signV4Request(JIMENG_ACCESS_KEY, JIMENG_SECRET_KEY, SERVICE, formattedQuery, formattedBody);
        log(colors.cyan, `🔍 查询任务请求URL: ${requestUrl}`);
        log(colors.cyan, `🔍 请求头: ${JSON.stringify(headers, null, 2)}`);
        log(colors.cyan, `🔍 请求体: ${formattedBody}`);
        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: headers,
            body: formattedBody
        });
        log(colors.cyan, `📊 响应状态: ${response.status} ${response.statusText}`);
        const responseText = await response.text();
        log(colors.cyan, `📄 响应体: ${responseText}`);
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
                }
                else if (result.data.video_url) {
                    return result.data.video_url; // 视频生成任务
                }
                else {
                    throw new Error("任务完成但未找到有效的结果URL");
                }
            }
            else if (result.data.status === "failed") {
                throw new Error(`任务执行失败: ${result.data.error_message || '未知错误'}`);
            }
            else if (result.data.status === "running") {
                // 任务还在运行中，返回null让轮询机制处理
                return null;
            }
        }
        return null;
    }
    catch (error) {
        console.error("查询任务结果时出错:", error);
        return null;
    }
}
// 轮询查询任务结果
async function queryTaskResultWithPolling(taskId, modelId) {
    const maxAttempts = 60; // 最大轮询次数
    const delayMs = 2000; // 每次轮询间隔2秒
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`轮询任务结果 (${attempt}/${maxAttempts}): ${taskId}`);
        const result = await queryTaskResult(taskId, modelId);
        if (result) {
            return result; // 任务完成，返回结果
        }
        if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    console.error(`任务轮询超时: ${taskId}`);
    return null;
}
// 提交任务
async function submitTask(model, params, apiConfig) {
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
        const { headers, requestUrl } = signV4Request(JIMENG_ACCESS_KEY, JIMENG_SECRET_KEY, SERVICE, formattedQuery, formattedBody);
        log(colors.cyan, `🔍 提交任务请求URL: ${requestUrl}`);
        log(colors.cyan, `🔍 请求头: ${JSON.stringify(headers, null, 2)}`);
        log(colors.cyan, `🔍 请求体: ${formattedBody}`);
        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: headers,
            body: formattedBody
        });
        log(colors.cyan, `📊 响应状态: ${response.status} ${response.statusText}`);
        const responseText = await response.text();
        log(colors.cyan, `📄 响应体: ${responseText}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}, response: ${responseText}`);
        }
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
    }
    catch (error) {
        console.error("提交任务时出错:", error);
        return null;
    }
}
// 调用即梦AI API（支持动态Action和Version，采用任务提交+轮询查询方式）
async function callJimengAPI(modelName, prompt, ratio, style, imageUrl, videoConfig, binaryDataBase64, reqImageStoreType, scale) {
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
    const params = {
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
    }
    else {
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
// 图片换装专用函数（完整实现）
async function callDressingAPI(modelImageUrl, garmentImageUrl, prompt, options) {
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
        const params = {
            prompt: prompt || '将服装自然地穿在模特身上',
            return_url: true
        };
        // 设置图片换装特定参数
        if (options) {
            if (options.garmentType)
                params.garment_type = options.garmentType;
            if (options.keepHead !== undefined)
                params.keep_head = options.keepHead;
            if (options.keepHand !== undefined)
                params.keep_hand = options.keepHand;
            if (options.keepFoot !== undefined)
                params.keep_foot = options.keepFoot;
            if (options.doSuperResolution !== undefined)
                params.do_super_resolution = options.doSuperResolution;
        }
        // 设置图片上传方式
        const reqImageStoreType = options?.reqImageStoreType ?? 1;
        if (reqImageStoreType == 0) {
            // 使用base64方式上传图片
            if (options?.binaryDataBase64) {
                params.binary_data_base64 = JSON.parse(options.binaryDataBase64); // 直接传入base64字符串
            }
            else {
                throw new Error('使用base64方式上传图片时，需要提供binaryDataBase64参数');
            }
            params.garment = { data: [{ type: options?.garmentType || 'full' }] };
        }
        else {
            // 使用URL方式上传图片
            params.model = { url: modelImageUrl };
            params.garment = { data: [{ url: garmentImageUrl, type: options?.garmentType || 'full' }] };
        }
        params.req_image_store_type = reqImageStoreType;
        debugger;
        params.req_key = 'dressing_diffusionV2';
        // 第一步：提交任务
        const taskId = await submitTask(modelId, params, // 直接传入完整的params对象
        apiConfig);
        if (!taskId) {
            throw new Error("任务提交失败");
        }
        log(colors.green, `✅ 图片换装任务提交成功，任务ID: ${taskId}`);
        // 第二步：轮询查询任务结果
        const result = await queryTaskResultWithPolling(taskId, modelId);
        return result;
    }
    catch (error) {
        console.error("调用图片换装API时出错:", error);
        return null;
    }
}
/**
 * 打印带颜色的日志
 */
function log(color, message, ...args) {
    const timestamp = new Date().toISOString();
    console.log(`${colors.bright}${colors.blue}[${timestamp}]${colors.reset} ${color}${message}${colors.reset}`, ...args);
}
/**
 * 打印测试开始信息
 */
function logTestStart(testName) {
    log(colors.magenta, `🚀 开始测试: ${testName}`);
}
/**
 * 打印测试成功信息
 */
function logTestSuccess(testName, result) {
    log(colors.green, `✅ 测试成功: ${testName}`);
    if (result) {
        log(colors.cyan, `   结果: ${JSON.stringify(result, null, 2)}`);
    }
}
/**
 * 打印测试失败信息
 */
function logTestFailure(testName, error) {
    log(colors.red, `❌ 测试失败: ${testName}`);
    log(colors.red, `   错误: ${error.message || error}`);
}
/**
 * 打印测试跳过信息
 */
function logTestSkip(testName, reason) {
    log(colors.yellow, `⏭️  测试跳过: ${testName} - ${reason}`);
}
/**
 * 检查环境变量配置
 */
function checkEnvironmentVariables() {
    const requiredVars = ['JIMENG_ACCESS_KEY', 'JIMENG_SECRET_KEY'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
        log(colors.red, `❌ 缺少环境变量: ${missingVars.join(', ')}`);
        log(colors.yellow, '💡 请检查.env文件或环境变量配置');
        return false;
    }
    log(colors.green, '✅ 环境变量配置正确');
    return true;
}
/**
 * 测试文生图3.1接口
 */
async function testTextToImage31() {
    const testName = '文生图3.1接口';
    logTestStart(testName);
    try {
        log(colors.cyan, '📝 测试参数:');
        log(colors.cyan, `   模型: ${MODEL_MAPPING['文生图3.1']}`);
        log(colors.cyan, `   Action: ${API_CONFIG_MAPPING['文生图3.1'].action}`);
        log(colors.cyan, `   Version: ${API_CONFIG_MAPPING['文生图3.1'].version}`);
        const prompt = '一只可爱的猫咪在花园里玩耍，阳光明媚，色彩鲜艳';
        const ratio = { width: 1024, height: 1024 };
        const style = '写实';
        log(colors.cyan, `   提示词: ${prompt}`);
        log(colors.cyan, `   尺寸: ${ratio.width}x${ratio.height}`);
        log(colors.cyan, `   风格: ${style}`);
        log(colors.yellow, '📤 提交任务...');
        const result = await callJimengAPI('文生图3.1', prompt, ratio, style);
        if (result) {
            logTestSuccess(testName, { imageUrl: result });
            return true;
        }
        else {
            logTestFailure(testName, 'API返回空结果');
            return false;
        }
    }
    catch (error) {
        logTestFailure(testName, error);
        return false;
    }
}
/**
 * 测试文生图4.0接口
 */
async function generateImg() {
    const testName = '生图4.0接口';
    logTestStart(testName);
    try {
        log(colors.cyan, '📝 测试参数:');
        log(colors.cyan, `   模型: ${MODEL_MAPPING['图片生成4.0']}`);
        log(colors.cyan, `   Action: ${API_CONFIG_MAPPING['图片生成4.0'].action}`);
        log(colors.cyan, `   Version: ${API_CONFIG_MAPPING['图片生成4.0'].version}`);
        const prompt = '生成两张图:1.一只可爱的猫咪在花园里玩耍，阳光明媚，色彩鲜艳，把参考图内容也融合进去,2.一只可爱的小狗在花园里玩耍，阳光明媚，色彩鲜艳，把参考图内容也融合进去';
        const ratio = { width: 1024, height: 1024 };
        const imgUrls = JSON.stringify(["https://images.unsplash.com/photo-1507525428034-b723cf961d3e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA==&auto=format&fit=crop&w=1200&q=80", "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1200&q=80"]);
        const scale = 0.7;
        log(colors.cyan, `   提示词: ${prompt}`);
        log(colors.cyan, `   尺寸: ${ratio.width}x${ratio.height}`);
        log(colors.cyan, `   图片URL: ${imgUrls}`);
        log(colors.cyan, `   参考比列: ${scale}`);
        log(colors.yellow, '📤 提交任务...');
        const result = await callJimengAPI("图片生成4.0", prompt, ratio, undefined, imgUrls, undefined, undefined, undefined, scale);
        if (result) {
            logTestSuccess(testName, { imageUrl: result });
            return true;
        }
        else {
            logTestFailure(testName, 'API返回空结果');
            return false;
        }
    }
    catch (error) {
        logTestFailure(testName, error);
        return false;
    }
}
/**
 * 测试图生图3.0接口
 */
async function testImageToImage30() {
    const testName = '图生图3.0接口';
    logTestStart(testName);
    try {
        log(colors.cyan, '📝 测试参数:');
        log(colors.cyan, `   模型: ${MODEL_MAPPING['图生图3.0']}`);
        log(colors.cyan, `   Action: ${API_CONFIG_MAPPING['图生图3.0'].action}`);
        log(colors.cyan, `   Version: ${API_CONFIG_MAPPING['图生图3.0'].version}`);
        const prompt = '将这张图片转换为卡通风格';
        // 图片Arrays与binary_data_base64二选一
        const imageUrl = JSON.stringify(new Array()); // 测试用URL，实际使用时需要替换
        const binary_data_base64 = JSON.stringify([await readFileAsBase64(TEST_IMG_PATH)]);
        const ratio = { width: 1024, height: 1024 };
        log(colors.cyan, `   提示词: ${prompt}`);
        log(colors.cyan, `   原图URL: ${imageUrl}`);
        log(colors.cyan, `   尺寸: ${ratio.width}x${ratio.height}`);
        // 检查是否有有效的图片URL
        if (!imageUrl && !binary_data_base64) {
            logTestSkip(testName, '需要提供有效的图片URL或二进制数据');
            return true; // 跳过但不视为失败
        }
        log(colors.yellow, '📤 提交任务...');
        const result = await callJimengAPI('图生图3.0', prompt, ratio, undefined, imageUrl, undefined, binary_data_base64);
        if (result) {
            logTestSuccess(testName, { imageUrl: result });
            return true;
        }
        else {
            logTestFailure(testName, 'API返回空结果');
            return false;
        }
    }
    catch (error) {
        logTestFailure(testName, error);
        return false;
    }
}
/**
 * 测试视频生成3.0 Pro接口
 */
async function testVideoGeneration30Pro() {
    const testName = '视频生成3.0 Pro接口';
    logTestStart(testName);
    try {
        log(colors.cyan, '📝 测试参数:');
        log(colors.cyan, `   模型: ${MODEL_MAPPING['视频生成3.0 Pro']}`);
        log(colors.cyan, `   Action: ${API_CONFIG_MAPPING['视频生成3.0 Pro'].action}`);
        log(colors.cyan, `   Version: ${API_CONFIG_MAPPING['视频生成3.0 Pro'].version}`);
        const prompt = '一个美丽的日落场景，云彩变幻，色彩丰富';
        const videoConfig = {
            frames: 121,
            aspect_ratio: '16:9'
        };
        log(colors.cyan, `   提示词: ${prompt}`);
        log(colors.cyan, `   帧数: ${videoConfig.frames}`);
        log(colors.cyan, `   比例: ${videoConfig.aspect_ratio}`);
        log(colors.yellow, '📤 提交任务...');
        const result = await callJimengAPI('视频生成3.0 Pro', prompt, undefined, undefined, undefined, videoConfig);
        if (result) {
            logTestSuccess(testName, { videoUrl: result });
            return true;
        }
        else {
            logTestFailure(testName, 'API返回空结果');
            return false;
        }
    }
    catch (error) {
        logTestFailure(testName, error);
        return false;
    }
}
/**
 * 测试图片换装V2接口
 */
async function testImageDressingV2() {
    const testName = '图片换装V2接口';
    logTestStart(testName);
    try {
        log(colors.cyan, '📝 测试参数:');
        log(colors.cyan, `   模型: ${MODEL_MAPPING['图片换装V2']}`);
        log(colors.cyan, `   Action: ${API_CONFIG_MAPPING['图片换装V2'].action}`);
        log(colors.cyan, `   Version: ${API_CONFIG_MAPPING['图片换装V2'].version}`);
        const modelImageUrl = ''; // 模特图片URL
        const garmentImageUrl = ''; // 服装图片URL
        const reqImageStoreType = 0; //默认为1,使用model与garment参数;为0时,使用binary_data_base64为参数(Array of string),以base64形式传入模特图与服装图
        const binaryDataBase64 = JSON.stringify([await readFileAsBase64(TEST_IMG_PATH), await readFileAsBase64(MODEL_IMAGE_PATH)]);
        const prompt = '将服装自然地穿在模特身上';
        log(colors.cyan, `   模特图URL: ${modelImageUrl}`);
        log(colors.cyan, `   服装图URL: ${garmentImageUrl}`);
        log(colors.cyan, `   提示词: ${prompt}`);
        // 检查是否有有效的图片URL
        if ((!modelImageUrl && !garmentImageUrl) && !binaryDataBase64) {
            logTestSkip(testName, '需要提供有效的模特图和服装图URL');
            return true; // 跳过但不视为失败
        }
        log(colors.yellow, '📤 提交任务...');
        const result = await callDressingAPI(modelImageUrl, garmentImageUrl, prompt, {
            garmentType: 'full',
            keepHead: true,
            keepHand: false,
            keepFoot: false,
            doSuperResolution: false,
            reqImageStoreType: reqImageStoreType,
            binaryDataBase64: binaryDataBase64,
        });
        if (result) {
            logTestSuccess(testName, { resultUrl: result });
            return true;
        }
        else {
            logTestFailure(testName, 'API返回空结果');
            return false;
        }
    }
    catch (error) {
        logTestFailure(testName, error);
        return false;
    }
}
/**
 * 主测试函数
 */
async function runAllTests() {
    log(colors.bright, '🎯 开始即梦AI接口测试');
    log(colors.cyan, '='.repeat(60));
    // 检查环境变量
    if (!checkEnvironmentVariables()) {
        log(colors.red, '❌ 环境变量检查失败，测试终止');
        return;
    }
    const tests = [
        { name: '文生图3.1', func: testTextToImage31 },
        { name: '图生图3.0', func: testImageToImage30 },
        { name: '视频生成3.0 Pro', func: testVideoGeneration30Pro },
        { name: '图片换装V2', func: testImageDressingV2 },
        { name: '图片生成4.0', func: generateImg }
    ];
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    for (const test of tests) {
        const result = await test.func();
        if (result === true) {
            passed++;
        }
        else if (result === false) {
            failed++;
        }
        else {
            skipped++;
        }
        log(colors.cyan, '-'.repeat(40));
    }
    // 测试结果汇总
    log(colors.cyan, '='.repeat(60));
    log(colors.bright, '📊 测试结果汇总:');
    log(colors.green, `✅ 通过: ${passed}`);
    log(colors.red, `❌ 失败: ${failed}`);
    log(colors.yellow, `⏭️  跳过: ${skipped}`);
    if (failed === 0) {
        log(colors.green, '🎉 所有测试通过！');
    }
    else {
        log(colors.red, '💥 部分测试失败，请检查接口配置');
    }
}
// 运行测试
if (process.argv[1] && process.argv[1].includes('test.ts')) {
    runAllTests().catch(error => {
        log(colors.red, '💥 测试执行出错:', error);
        process.exit(1);
    });
}
export { testTextToImage31, generateImg, testImageToImage30, testVideoGeneration30Pro, testImageDressingV2, runAllTests };
