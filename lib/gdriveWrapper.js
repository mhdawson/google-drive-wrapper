// Copyright 2016 the project authors as listed in the AUTHORS file.
// All rights reserved. Use of this source code is governed by the
// license that can be found in the LICENSE file.

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var zlib = require('zlib');
var mimetype = require('mime-types');

function gdriveWrapper(auth, google, password) {
  this.drive = google.drive({ version: 'v3', auth: auth });
  this.password = password;
}

gdriveWrapper.prototype.uploadFile = function(filename, options, complete)
{
  var extension = '';

  var uploadStream = fs.createReadStream(filename);
  if (options.compress !== false) {
    var zip = zlib.createGzip();
    uploadStream = uploadStream.pipe(zip);
    extension = '.gz';
  }

  if(options.encrypt !== false) {
    var enc = crypto.createCipher('aes-256-cbc', this.password);
    uploadStream = uploadStream.pipe(enc);
    extension = extension + '.enc';
  }

  var mimeType = mimetype.lookup(filename.substring(filename.indexOf('.')));

  this.drive.files.create(
    { resource: { name: filename + extension,
                  parents: [options.parent],
                  spaces: 'drive',
                  mimeType: mimeType },
      media: { mimeType: mimeType,
               body: uploadStream } 
    },
    complete);
}


gdriveWrapper.prototype.downloadFile = function(fileId, destFilename, complete)
{
  wrapperThis = this;
  var extension = '';
  this.getFileMetadata(fileId, function(err, meta) {
    var output = wrapperThis.drive.files.get({fileId: fileId, alt: 'media'});
    output.on('error', complete);
    output.on('end', function() {
      complete(null, meta);
    });

    var name = meta.name;
    var lastExtension = name.substring(name.lastIndexOf('.'));
    if(lastExtension === '.enc') {
      var dec = crypto.createDecipher('aes-256-cbc', wrapperThis.password);
      output = output.pipe(dec);
      output.on('error', complete);
      name = name.substring(0, name.lastIndexOf('.'));
    }

    var lastExtension = name.substring(name.lastIndexOf('.'));
    if(lastExtension === '.gz') {
      var unzip = zlib.createGunzip();
      output = output.pipe(unzip);
      output.on('error', complete);
    }

    var outputFile = fs.createWriteStream(destFilename);
    output.pipe(outputFile);
  });
}

// must start at root
gdriveWrapper.prototype.getMetaForFilename = function(filename, complete) {
  wrapperThis = this;

  if (filename[0] === '/') {
    filename = filename.substring(1);
  }
  fileComponents = filename.split('/');

  var findNext = function(parent, fileComponents, index) {
    var query = 'name = \'' + fileComponents[index] + '\'';
    if (parent !== null) {
      query = query + ' and \'' + parent + '\' in parents'; 
    }
    wrapperThis.drive.files.list(
      { spaces: 'drive',
        pageSize: 1,
        q: query },
      function(err, response) {
        if (err !== null) {
          complete(err);
          return;
        }
        if (response.files.length !== 1) {
          complete(new Error('File component not found:' + fileComponents[index]));
          return;
        }
     
        if (index < (fileComponents.length - 1)) {     
          index = index + 1;
          findNext(response.files[0].id, fileComponents, index);
        } else {
          complete(null, response.files[0]);
        }
      }
    );
  }
 
  findNext(null, fileComponents, 0);  
}

gdriveWrapper.prototype.downloadNewFiles = function(gdriveDirectory, targetDirectory, complete) {
  wrapperThis = this;

  // get list of existing files so we only download new files
  var existingFileName = path.join(targetDirectory,'.existing');
  var existingFiles = new Array();
  var fileLookup = new Object();
  try {
    var existingFiles = fs.readFileSync(existingFileName).toString().split(',');
    for(var i = 0; i < existingFiles.length; i++) {
      fileLookup[existingFiles[i]] = true; 
    }
  } catch (err) {
    // ENOENT (-2) is ok as we just don't have a list of existing files yet
    if (err.errno !== -2) {
      complete(err);
      return;
    }
  }

  this.getMetaForFilename(gdriveDirectory, function(err, parentMeta) {
    var getNextFile = function(nextPageToken) {
      wrapperThis.drive.files.list({
        pageSize: 2,
        pageToken: nextPageToken,
        q: '\'' + parentMeta.id + '\' in parents',
        space: 'drive' },
        function(err, response) {
          if (err) {
            complete(err);
            return;
          }
          var files = response.files;
          if (files.length === 0) {
            complete(null);
            return;
          }

          var filesBeingDownloaded = 0;
          var checkGetNextFiles = function() {
            if((filesBeingDownloaded == 0) && (response.nextPageToken)) {
              getNextFile(response.nextPageToken);
            }
          }

          for (var i = 0; i < files.length; i++) {
            var file = files[i];
            if (fileLookup[file.id] !== true) { 
              // need to download
              filesBeingDownloaded++;

              // strip off the extenstion names that will be removed automatically
              // as the file is decrypted/decompressed if appropriate
              var targetFileName = file.name
              var lastExtension = targetFileName.substring(targetFileName.lastIndexOf('.'));
              if(lastExtension === '.enc') {
                 targetFileName = targetFileName.substring(0, targetFileName.lastIndexOf('.'));
              }
              lastExtension = targetFileName.substring(targetFileName.lastIndexOf('.'));
              if(lastExtension === '.gz') {
                 targetFileName = targetFileName.substring(0, targetFileName.lastIndexOf('.'));
              }

              wrapperThis.downloadFile(file.id, path.join(targetDirectory, file.id + '-' + targetFileName), function(err, meta) {
                if (!err) {
                  try { 
                    fs.appendFileSync(existingFileName, ',' + meta.id);
                    filesBeingDownloaded--;
                    checkGetNextFiles();
                  } catch (err) {
                    complete(new Error(5, "Failed to append to existing file list"));
                    return;
                  }
                }  else {
                  complete(err);
                  return;
                }
              });
            }
          }
          checkGetNextFiles();
        }
      );
    }

    // ok now start by getting the first page
    getNextFile(null);
  });
}

gdriveWrapper.prototype.getFileMetadata = function(fileId, complete) {
  output = this.drive.files.get({fileId: fileId}, complete);
}

module.exports = gdriveWrapper;
