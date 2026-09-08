export async function api<T>(url:string,method='GET',data?:unknown):Promise<T>{
  let response:Response;
  try{response=await fetch(url,{method,headers:{'Content-Type':'application/json','X-Karma-Request':'1'},body:data===undefined?undefined:JSON.stringify(data)});}catch{throw new Error('Cannot reach Karma CMS. Check that the local server is running, then retry.');}
  let result:any;try{result=await response.json();}catch{throw new Error('The server returned an unexpected response. Check the CMS terminal.');}
  if(!response.ok)throw new Error(result.error||'Request failed.');return result;
}
