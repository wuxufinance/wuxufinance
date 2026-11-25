export function safeLearningHash(value){
 if(typeof value!=='string'||value.length>240)return '#/account';
 if(/^#\/(?:account|catalog|lab|review|progress)$/.test(value))return value;
 if(/^#\/purchase\/[1-9]\d{0,5}$/.test(value))return value;
 if(/^#\/course\/[1-9]\d{0,5}(?:\/(?:overview|concepts|formulas|cases|calculator|quiz)(?:\/[a-z][a-z0-9-]{0,60})?)?$/.test(value))return value;
 return '#/account';
}
export const authRoute=hash=>/^#\/auth\/(?:login|register|recover|verify|reset)$/.test(hash);
export const passwordValid=value=>typeof value==='string'&&value.length>=12&&value.length<=128;
export const emailValid=value=>typeof value==='string'&&value.length<=250&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export async function createPKCE(cryptoProvider=crypto){
 const verifier=[...cryptoProvider.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const bytes=new Uint8Array(await cryptoProvider.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
 const challenge=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 return {verifier,challenge};
}
export function publicAuthError(data){
 const code=data?.code||data?.error_code;
 if(code==='invalid_credentials'||data?.msg==='Invalid login credentials')return '邮箱或密码不正确。';
 if(code==='email_not_confirmed')return '邮箱尚未验证，请先完成邮箱验证。';
 if(code==='over_email_send_rate_limit'||code==='over_request_rate_limit')return '请求过于频繁，请稍后再试。';
 if(code==='email_address_not_authorized'||code==='unexpected_failure')return '邮件暂时无法发送，请联系管理员检查邮件服务配置。';
 if(code==='otp_expired')return '验证码或链接已失效，请重新申请并使用最新邮件。';
 if(code==='weak_password')return '密码强度不足，请使用至少12个字符并混合字母、数字和符号。';
 return '操作未完成，请检查输入或稍后重试。';
}
