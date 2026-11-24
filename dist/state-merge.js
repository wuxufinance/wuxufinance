export function mergeState(base,local,remote){
  const copy=structuredClone(remote),mergeSet=(a=[],b=[],c=[])=>{const result=new Set(c);for(const x of a)if(!b.includes(x))result.delete(x);for(const x of b)if(!a.includes(x))result.add(x);return [...result];};
  for(const key of ['bookmarks','reviews'])copy[key]=mergeSet(base[key],local[key],remote[key]);
  copy.courses||={};copy.notes||={};
  for(const [id,r] of Object.entries(local.courses||{})){
    const b=base.courses?.[id]||{},other=copy.courses[id]||{};
    copy.courses[id]={...other,read:mergeSet(b.read,r.read,other.read)};
    if(JSON.stringify(r.answers)!==JSON.stringify(b.answers))copy.courses[id].answers=r.answers;
    if(r.submitted===false&&b.submitted!==false)copy.courses[id].submitted=false;
  }
  for(const [id,note] of Object.entries(local.notes||{}))if(note!==base.notes?.[id])copy.notes[id]=note;
  copy.last=local.last;return copy;
}
