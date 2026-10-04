IDIAPlatforms.register({id:'gemini',name:'Gemini',hostnames:['gemini.google.com'],routes:[/^\/app\/([A-Za-z0-9_-]{1,128})(?:\/|$)/],
 composers:['rich-textarea [contenteditable="true"]','[contenteditable="true"][aria-label*="Gemini"]','textarea[aria-label*="Gemini"]'],
 containers:'form, rich-textarea, [data-testid="composer"]',sendIds:['send-button'],enter:true,
 transcript:'user-query, model-response',newPaths:['/','/app']});
