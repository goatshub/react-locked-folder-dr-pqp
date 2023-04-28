/* Full code: https://github.com/goatshub/react-locked-folder-dr-pqp.git */
/* This webapp is similar to https://github.com/goatshub/react-locked-folder but with extra column "Lock reason" and the webapp script is only used for unlocking projects locked by PQP or DR reasons. The permitted and notify emails are from different source. When unlocked projects, the webapp will remove brackets (stating type DR or PQP lock) from folder name. */

const ruleSheetId = '1xuMyOiwY4fgXHDSjqo4YX8XdTg094yHxbQ3m3o7ySbs'  //Sheet to get drive ID and permitted emails list
/*
* Return html page
*
*/
function doGet(){
    let tmp = HtmlService.createTemplateFromFile("index")
    return tmp.evaluate().setTitle("DR & PQP Locked Drive").addMetaTag("viewport", "width-device-width, initial-scale=1.0")
}

/*
* Get filtered PQP or DR locked project folders in all locked drives and return list of data.
* @returns {Object[]} projNo (string), projName (string), id (string), lockType {string}
*
*/
function getLockedDriveProjects(){
  const ss = SpreadsheetApp.openById(ruleSheetId).getSheetByName("Lock Folder")
  let data = ss.getDataRange().getValues()
  data.shift()
  //get  DR & PQP unlock folders permittedEmails by data[0][5] = cell F2
  let hasPermission = getPermission(data[0][5])
  let lockedDriveArr = data.map(row=> row[1])
  let projData = []
  lockedDriveArr.forEach(lockedDriveIdEach => {
    let drive = DriveApp.getFolderById(lockedDriveIdEach)
    let folders = drive.getFolders()
    while(folders.hasNext()){
      let folder = folders.next()
      let [projNo, ...projName] = folder.getName().split(" ")
      let projNameJoined = projName.join(" ").trim()  //folder name string without projNo
      let folderId = folder.getId()

      //******Filter showing only projects locked by Design Review or PQP
      //extract word with double bracket in folder name {{word}} => return ["{{word}}", "word"] or null if not found
      const regex = /\{\{([^}]+)\}\}/;  
      const found = regex.exec(projNameJoined); //if found, return either ["{{Design Review Locked}}", "Design Review Locked"] or ["{{PQP Locked}}", "PQP Locked"]
      if(found){
        //if the folder was locked because of pqp or design review, folder name has a reason why it's locked in the end of folder name bracket {{type of lock (pqp or dr)}}
        let projNameNoBracket = projNameJoined.split(/\s*\{{.*\}}/g)[0]  //original project name in folder name without {{}}
        let lockType = found[1] //get "Design Review Locked" or "PQP Locked"
        projData.push({projNo, projName: projNameNoBracket, id: folderId, lockType})
      }
    }
  })
  projData = projData.sort((a, b) => b.projNo.localeCompare(a.projNo))
  
  
  return { hasPermission, projData }
}

/*
* Get permission by sessionEmail return true if the email is in "Rule" sheet "Locked Drive" tab "F2" cell. 
* If permission is true then show unlock button. If not only shows the project list.
* @param {string} permittedEmails - list of permitted emails separated by comma
* @return {boolean} hasPermission
*/
function getPermission(permittedEmails) {
  let sessionEmail = Session.getActiveUser().getEmail()
  let hasPermission = false

  if(permittedEmails.includes(sessionEmail.toString().toLowerCase().trim())) hasPermission = true

  return hasPermission
}


/*
* Move folder to J drive according to year and region (if > 2023). Notify emails in H2 cell in tab "Lock Folder". 
* Rename by Removing bracket from folder name back to original folder name.
* @param {string} folderID - folder id of folder in locked drive to move to J drive
* @return {string} folderUrl
*/
function moveLockedToDriveJ(folderID){
  let originalJFolder
  let folder = DriveApp.getFolderById(folderID)
  let folderName = folder.getName()
  let projNoYear = folderName.split("-")[0]
  let folderNameNoBracket = folderName.split(/\s*\{{.*\}}/g)[0]  //original folder name in folder name without {{}}
  
  const jFolderIdData = SpreadsheetApp.openById(ruleSheetId).getSheetByName("J Folder").getDataRange().getValues()

  //project year 2023 onwards will move to separated folder for each region. Before 2023 only separated by year
  if(parseInt(projNoYear) > 22){
    let parents = folder.getParents()
    if(parents.hasNext()){
      let parent = parents.next()
      let parentName = parent.getName()
      console.log(parentName)
      let originalJFolderId = jFolderIdData.find(row=> row[0].toString().trim() === `20${projNoYear}-${parentName}`)
      if(originalJFolderId) originalJFolder = DriveApp.getFolderById(originalJFolderId[1])
    }
  }else{
    let originalJFolderId = jFolderIdData.find(row=> row[0].toString().trim() === ((projNoYear === "18" || projNoYear === "20" ) ? `20${projNoYear}-1` : `20${projNoYear}`))
    if(originalJFolderId) originalJFolder = DriveApp.getFolderById(originalJFolderId[1])
  }

  if (originalJFolder) {
    folder.setName(folderNameNoBracket) //change folder name back to original
    folder.moveTo(originalJFolder)
    let folderUrl = folder.getUrl()
    let sessionEmail = Session.getActiveUser().getEmail()
    //get email to notify of DR & PQP folder locke/unlock from H2 cell in tab "Lock Folder"
    let notifyEmails = SpreadsheetApp.openById(ruleSheetId).getSheetByName("Lock Folder").getRange("H2").getValue()
    if(notifyEmails){
      MailApp.sendEmail(
        notifyEmails,
        `Locked folder has been unlocked.`,
        `Unlocked ${folderName}. Url: ${folderUrl} by ${sessionEmail}`,
        {
          name: `Locked folders notification`,
          htmlBody: `Unlocked <a href="${folderUrl}" target="_blank">${folderName}</a>. by ${sessionEmail}`
        }
      )
    }
    return folderUrl
  }else{
    throw new Error(`Drive J not found. Please contact IT.`)
  }
}