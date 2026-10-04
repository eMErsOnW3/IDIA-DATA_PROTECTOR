IDIAPlatforms.register({id:'claude',name:'Claude',hostnames:['claude.ai'],routes:[/^\/chat\/([A-Za-z0-9_-]{1,128})(?:\/|$)/],
 composers:['form .ProseMirror[contenteditable="true"]','[contenteditable="true"][data-placeholder*="Claude"]','[contenteditable="true"][aria-label*="Claude"]','textarea[placeholder*="Claude"]'],
 containers:'form, [data-testid="composer"]',sendIds:['send-button'],enter:true,
 transcript:'[data-testid="user-message"], [data-message-author-role]',newPaths:['/','/new']});
