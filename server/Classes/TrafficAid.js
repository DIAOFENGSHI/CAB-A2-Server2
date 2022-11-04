function addCount(locations,toptenInfo){
  locations.map((locationID)=>{
    toptenInfo = toptenInfo.map((location)=>{
      if(location.id == locationID){
        location.count = location.count + 1
        return location
      }
      else{
        return location
      }
    })
  })
  toptenInfo.sort(
    (l1, l2) => 
    (l1.count < l2.count) ? 1 : (l1.count > l2.count) ? -1 : 0);
  return toptenInfo
  }

function includesNullValue(arr){
  const check = arr.filter((ele)=>{if(ele.count==null){ return 1}})
  if(check == null){return false}
  else{return true}
}

exports.includesNullValue = includesNullValue;
exports.addCount = addCount;

