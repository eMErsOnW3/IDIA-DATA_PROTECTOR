// Pure platform definitions shared by the service worker and content registry.
(() => {
  const definitions=[];
  function select(url){const u=new URL(url);return u.protocol==='https:'?definitions.find(p=>p.hostnames.includes(u.hostname)&&u.port===''):undefined;}
  function identity(url){const u=new URL(url),p=select(url);if(!p)throw new Error('Unsupported conversation origin.');
    for(const rule of p.routes||[]){const id=u.pathname.match(rule)?.[1];if(id)return p.id+':'+id;}
    for(const key of p.queryKeys||[]){const id=u.searchParams.get(key);if(id&&/^[A-Za-z0-9_-]{1,128}$/.test(id))return p.id+':'+id;}
    return null;
  }
  globalThis.IDIAPlatforms=Object.freeze({register:p=>definitions.push(Object.freeze(p)),select,identity,all:()=>[...definitions]});
})();
