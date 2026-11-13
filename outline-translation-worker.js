/* The Bergamot WASM runtime is distributed under MPL-2.0.
 * https://codeberg.org/mkljczk/bergamot-translator
 */
'use strict';

const runtimeBase='https://cdn.jsdelivr.net/npm/@mkljczk/bergamot-translator@0.4.16/worker/';
const modelBase='https://huggingface.co/midudev/firefox-translations/resolve/6f6acd72c26975a06a8e61b72d1fbacbd184c23f/';
const gemmExports={
  int8_prepare_a:'int8PrepareAFallback',
  int8_prepare_b:'int8PrepareBFallback',
  int8_prepare_b_from_transposed:'int8PrepareBFromTransposedFallback',
  int8_prepare_b_from_quantized_transposed:'int8PrepareBFromQuantizedTransposedFallback',
  int8_prepare_bias:'int8PrepareBiasFallback',
  int8_multiply_and_add_bias:'int8MultiplyAndAddBiasFallback',
  int8_select_columns_of_b:'int8SelectColumnsOfBFallback'
};
let runtime;
const models=new Map();

async function download(base,path,cache) {
  const url=base+path;
  const cached=await cache?.match(url);
  if(cached)return cached.arrayBuffer();
  const response=await fetch(url,{credentials:'omit'});
  if(!response.ok)throw new Error('Translation asset HTTP '+response.status+' ('+path+')');
  const bytes=await response.arrayBuffer();
  if(cache){
    try{await cache.put(url,new Response(bytes));}catch{}
  }
  return bytes;
}

function loadRuntime() {
  if(runtime)return runtime;
  runtime=new Promise((resolve,reject)=>{
    const wasm=download(runtimeBase,'bergamot-translator-worker.wasm');
    // Emscripten reads Module when the classic runtime script is loaded.
    self.Module={
      onRuntimeInitialized(){resolve(new self.Module.BlockingService({cacheSize:0}));},
      onAbort(reason){reject(new Error('Translation runtime aborted: '+reason));},
      instantiateWasm(imports,onSuccess){
        const wasm_gemm=Object.fromEntries(Object.entries(gemmExports).map(([name,method])=>[
          name,(...args)=>self.Module.asm[method](...args)
        ]));
        wasm.then(bytes=>WebAssembly.instantiate(bytes,{...imports,wasm_gemm}))
          .then(({instance,module})=>onSuccess(instance,module)).catch(reject);
        return {};
      }
    };
    try{importScripts(runtimeBase+'bergamot-translator-worker.js');}
    catch(error){wasm.catch(()=>{});reject(error);}
  });
  return runtime;
}

function aligned(bytes,alignment){
  const memory=new self.Module.AlignedMemory(bytes.byteLength,alignment);
  memory.getByteArrayView().set(new Int8Array(bytes));
  return memory;
}

function loadModel(pair){
  if(models.has(pair))return models.get(pair);
  const task=(async()=>{
    const code=pair.replace('-','');
    let cache;
    try{cache=await caches.open('outline-translation-models-v1');}catch{}
    const [model,lex,vocab]=await Promise.all([
      'model.'+code+'.intgemm.alphas.bin','lex.50.50.'+code+'.s2t.bin','vocab.'+code+'.spm'
    ].map(name=>download(modelBase,pair+'/'+name,cache)));
    await loadRuntime();
    const vocabs=new self.Module.AlignedMemoryList();
    vocabs.push_back(aligned(vocab,64));
    const config='beam-size: 1\nnormalize: 1.0\nword-penalty: 0\ncpu-threads: 0\ngemm-precision: int8shiftAlphaAll\nskip-cost: true\nalignment: soft\nquiet: true\nquiet-translation: true\nmax-length-break: 128\nmini-batch-words: 1024\nworkspace: 128\nmax-length-factor: 2.0\n';
    return new self.Module.TranslationModel(config,aligned(model,256),aligned(lex,64),vocabs,null);
  })();
  models.set(pair,task);
  return task;
}

self.onmessage=async({data:{id,operation,text,to}})=>{
  try{
    if(to!=='pt'&&to!=='vi')throw new Error('Invalid target language');
    const [service,first,second]=await Promise.all([loadRuntime(),loadModel('ja-en'),loadModel('en-'+to)]);
    if(operation==='load'){self.postMessage({id});return;}
    const module=self.Module;
    const input=new module.VectorString(),options=new module.VectorResponseOptions();
    let result;
    try{
      input.push_back(text);
      options.push_back({alignment:false,html:false,qualityScores:false});
      result=service.translateViaPivoting(first,second,input,options);
      self.postMessage({id,text:result.get(0).getTranslatedText().trim()});
    }finally{
      result?.delete();
      input.delete();
      options.delete();
    }
  }catch(error){self.postMessage({id,error:error.message||String(error)});}
};
