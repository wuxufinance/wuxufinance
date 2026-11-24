// Course bodies are delivered by the permission-checked backend after login.
export const courses=[];
export const sources=[];
export function setCurriculum(data){courses.splice(0,courses.length,...data.courses);sources.splice(0,sources.length,...data.sources);}
