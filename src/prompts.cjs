/* Claude prompts and output schemas, shared by the claude.ai artifact (sent through the
   `sample` capability) and the web server function (api/claude.js). Each task takes plain
   params and returns {prompt, schema, tier, effort}. Loaded as a classic script in the
   page (sets window.HB_PROMPTS) and with require() on the server. */
(function(root){
  const num={type:["number","null"]};
  const obj=(props)=>({type:"object",properties:props,required:Object.keys(props),additionalProperties:false});
  const list=(item)=>obj({items:{type:"array",items:item}});
  // The language the user reads the app in; short notes come back in it. Defaults to Hebrew.
  const language=p=>p.lang==="en"?"English":"Hebrew";

  const MENU_ITEM=obj({name:{type:"string"},kind:{type:"string",enum:["wine","spirit"]},glass:num,bottle:num,retail_low:num,retail_high:num,note:{type:"string"}});
  const WINE_HIT=obj({name:{type:"string"},he_name:{type:"string"},kind:{type:"string",enum:["red","white","rose","sparkling","other"]},note:{type:"string"},retail_low:num,retail_high:num,confidence:{type:"string",enum:["high","medium","low"]}});
  const BOTTLE_HIT=obj({id:{type:"string"},name:{type:"string"},style:{type:"string"},il_low:num,il_high:num,us_low:num,us_high:num});
  const PHOTO_HIT=obj({id:{type:"string"},name:{type:["string","null"]},style:{type:["string","null"]}});

  function menuPrompt(extra,p){
    return "You help a diner in a restaurant judge a drinks menu. "+extra+
      "\nFor each item estimate the typical retail shop price of one bottle (750 ml for wine, 700 ml for spirits) in "+p.country+" in "+p.currency+
      ", as retail_low and retail_high numbers, or null if you cannot identify the wine well enough. Be realistic; do not guess wildly."+
      "\nReturn ONLY JSON: {\"items\":[{\"name\":string,\"kind\":\"wine\"|\"spirit\",\"glass\":number|null,\"bottle\":number|null,\"retail_low\":number|null,\"retail_high\":number|null,\"note\":string}]}"+
      "\n`note` is a very short description in "+language(p)+" (grape, region, vintage), e.g. \"Cabernet Sauvignon, Upper Galilee, 2021\". Keep names as printed on the menu.";
  }
  const EXTRACT="Extract every wine, and any spirit sold by the glass, with its glass price and bottle price as printed (numbers only, null if missing). Skip food.";

  const TASKS={
    // Every task also takes p.lang ("he" | "en"), the language for notes.
    // p: {country, currency}; one image attached
    menu_photo:p=>({tier:"default",effort:"medium",schema:list(MENU_ITEM),images:true,
      prompt:menuPrompt("The attached image is a photo of a restaurant menu. "+EXTRACT,p)}),
    // p: {country, currency, text}
    menu_text:p=>({tier:"default",effort:"medium",schema:list(MENU_ITEM),
      prompt:menuPrompt("Below is text copied from a restaurant menu (it may be messy OCR). "+EXTRACT+"\n---\n"+String(p.text||"").slice(0,12000)+"\n---",p)}),
    // p: {country, currency, lines: "name | glass | bottle" per line}
    menu_estimate:p=>({tier:"default",effort:"medium",schema:list(MENU_ITEM),
      prompt:menuPrompt("Here are items from a restaurant menu (name | glass price | bottle price):\n"+String(p.lines||"").slice(0,8000)+"\nReturn them in the same order with the same names and prices.",p)}),
    // p: {country, currency, q}
    wine_search:p=>({tier:"complex",effort:"high",schema:list(WINE_HIT),
      prompt:"You are a wine expert helping a diner in "+p.country+" who is looking at a restaurant wine list. They typed: \""+String(p.q||"").slice(0,200)+"\"."+
      "\nThe text is probably Hebrew and may be a winery name, a label, a grape, or a phrase like 'the red of <winery>'. First work out what it refers to: translate or transliterate Hebrew winery names (examples: סוסון ים = Sea Horse Winery, כרם שבו = Shvo Vineyards, לוינסון = Lewinsohn, צרעה = Tzora, ספרה = Sphera, גבעות = Gvaot, נטופה = Netofa, בת שלמה = Bat Shlomo). Israeli boutique wineries are very likely."+
      "\nIf a winery is named with a color or style, list that winery's actual wines of that color. If only a winery is named, list its best-known wines. Only list wines you believe really exist; mark confidence."+
      "\nFor each give: name (English), he_name (as written on Israeli menus, in Hebrew), kind (red, white, rose, sparkling or other), note (very short, in "+language(p)+": color, grapes, region), and the typical retail shop price of a 750 ml bottle in "+p.country+" in "+p.currency+" as retail_low and retail_high (null if you don't know). Up to 5 wines, most likely first."+
      "\nReturn ONLY JSON: {\"items\":[{\"name\":string,\"he_name\":string,\"kind\":\"red\"|\"white\"|\"rose\"|\"sparkling\"|\"other\",\"note\":string,\"retail_low\":number|null,\"retail_high\":number|null,\"confidence\":\"high\"|\"medium\"|\"low\"}]}"}),
    // p: {q, catalog, styles}
    bottle_identify:p=>({tier:"complex",effort:"high",schema:list(BOTTLE_HIT),
      prompt:"Someone in Israel is listing the bottles they have at home and typed: \""+String(p.q||"").slice(0,200)+"\". It may be Hebrew (transliterate brand names, e.g. וודפורד = Woodford, סוסון ים = Sea Horse Winery), a typo, a partial name, or a wine; Israeli brands and wineries are likely."+
      "\nIdentify up to 3 real products it most likely means, most likely first. Map each to one catalog id (lines are 'id = display name'):\n"+p.catalog+
      "\nFor spirits pick the closest style key for that id:\n"+p.styles+"\nFor other ids use style \"std\"."+
      "\nAlso estimate the typical shelf price range: il_low/il_high in ILS for 700 ml in Israel, us_low/us_high in USD for 750 ml in the US (null if not sold there)."+
      "\nReturn ONLY JSON: {\"items\":[{\"id\":string,\"name\":string,\"style\":string,\"il_low\":number|null,\"il_high\":number|null,\"us_low\":number|null,\"us_high\":number|null}]}. name = the official product name in Latin letters. Empty list if nothing fits."}),
    // p: {catalog, styles}; one image attached
    bottle_photo:p=>({tier:"default",effort:"medium",schema:list(PHOTO_HIT),images:true,
      prompt:"The attached photo shows one or more bottles or drink ingredients at someone's home. Identify each one and map it to this catalog (lines are 'id = display name'):\n"+p.catalog+
      "\n\nFor spirits, also give the brand/product name as printed on the label (in Latin letters if the label uses them) and pick the closest style key for that id:\n"+p.styles+
      "\n\nReturn ONLY JSON: {\"items\":[{\"id\":catalog id,\"name\":string|null,\"style\":style key|null}]}. Use only ids from the catalog; skip anything that does not fit. Empty list if you see no bottles."})
  };
  if(typeof module!=="undefined"&&module.exports)module.exports=TASKS;
  else root.HB_PROMPTS=TASKS;
})(typeof window!=="undefined"?window:globalThis);
