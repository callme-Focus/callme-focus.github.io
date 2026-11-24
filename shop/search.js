"use strict";
const terms=new URLSearchParams(location.search).get("q")?.trim().toLowerCase().replace(/t[ -]?shirts?/g,"tshirt").split(/\s+/).filter(Boolean)||[];
for(const card of document.querySelectorAll("main a"))if(!terms.every(term=>card.getAttribute("aria-label").toLowerCase().replace(/t[ -]?shirts?/g,"tshirt").includes(term)))card.remove();
