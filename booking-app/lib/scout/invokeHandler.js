export function invokeHandler(handler, body) {
  return new Promise((resolve,reject)=>{
    let settled=false;
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(payload){settled=true;this.statusCode>=400?reject(new Error(payload?.error||`Pipeline stage failed (${this.statusCode})`)):resolve(payload);return this;},end(){settled=true;resolve(null);}};
    Promise.resolve(handler({method:'POST',body,headers:{},query:{}},res)).catch(reject).finally(()=>{if(!settled) reject(new Error('Pipeline stage returned no response'));});
  });
}
