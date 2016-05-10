// Copyright 2016 the project authors as listed in the AUTHORS file.
// All rights reserved. Use of this source code is governed by the
// license that can be found in the LICENSE file.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const mimetype = require('mime-types');

function gdriveWrapper(auth, google, password) {
  this.drive = google.drive({ version: 'v3', auth: auth });
  this.password = password;
}

gdriveWrapper.prototype.uploadFile = function(filename, sourceFile,  options, complete)
{
  var extension = '';

  // common error handler for pipes
  var errorOccurred = false;
  var handlePipeError = function(err) {
    if (!errorOccurred) {
      errorOccurred = true;
      complete(err, null, sourceFile)
    }
  };

  var uploadStream = fs.createReadStream(sourceFile);
  uploadStream.on('error', handlePipeError);

  if (options.compress !== false) {
    var zip = zlib.createGzip();
    uploadStream = uploadStream.pipe(zip);
    uploadStream.on('error', handlePipeError);
    extension = '.gz';
  }

  if(options.encrypt !== false) {
    var enc = crypto.createCipher('aes-256-cbc', this.password);
    uploadStream = uploadStream.pipe(enc);
    uploadStream.on('error', handlePipeError);
    extension = extension + '.enc';
  }

  var mimeType = mimetype.lookup(sourceFile.substring(filename.indexOf('.')));
  if (mimeType === false) {
    mimeType = 'application/octet-stream';
  }

  // this is to support converting a file to a google doc
  var convertOnUpload = false;
  var uploadMimeType = mimeType;
  if (options.convert === true) {
    // this is for importing google docs
    convertOnUpload = true;
    if (options.mimeType)  {
      uploadMimeType = options.mimeType;
    }
  }
  this.drive.files.create(
    { resource: { name: filename + extension,
                  parents: [options.parent],
                  spaces: 'drive',
                  mimeType: uploadMimeType,
                  convert: convertOnUpload },
      media: { mimeType: mimeType,
               body: uploadStream } 
    },
    complete);
}


gdriveWrapper.prototype.downloadFile = function(fileId, destFilename, complete)
{
  const wrapperThis = this;
  var extension = '';
  this.getFileMetadata(fileId, function(err, meta) {
    var output = wrapperThis.drive.files.get({fileId: fileId, alt: 'media'}, function() {
      // do nothing but we need this to avoid console output
      // in error conditions
    });

    // common error handler for pipes
    var errorOccurred = false;
    var handlePipeError = function(err) {
      if (!errorOccurred) {
        errorOccurred = true;
        complete(err, null, destFilename)
      }
    };

    var requestOutput = output;
    output.on('error', handlePipeError);
    output.on('end', function() {
      // make sure we process any error event first
      setImmediate(function() {
        if (!errorOccurred) {
          if(requestOutput.response.statusCode != 200) {
            complete(new Error(requestOutput.response.statusMessage), null, destFilename);
          } else {
            complete(null, meta);
          }
        }
      });
    });

    var name = meta.name;
    var lastExtension = name.substring(name.lastIndexOf('.'));
    if(lastExtension === '.enc') {
      var dec = crypto.createDecipher('aes-256-cbc', wrapperThis.password);
      output = output.pipe(dec);
      output.on('error', handlePipeError);
      name = name.substring(0, name.lastIndexOf('.'));
    }

    var lastExtension = name.substring(name.lastIndexOf('.'));
    if(lastExtension === '.gz') {
      var unzip = zlib.createGunzip();
      output = output.pipe(unzip);
      output.on('error', handlePipeError);
    }

    var outputFile = fs.createWriteStream(destFilename);
    output.pipe(outputFile);
  });
}

// must start at root
gdriveWrapper.prototype.getMetaForFilename = function(filename, complete) {
  const wrapperThis = this;

  if (filename[0] === '/') {
    filename = filename.substring(1);
  }
  fileComponents = filename.split('/');

  var findNext = function(parent, fileComponents, index) {
    var query = 'name = \'' + fileComponents[index] + '\'';
    if (parent !== null) {
      query = query + ' and \'' + parent + '\' in parents' + ' and trashed != true';
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
  const wrapperThis = this;

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
    if (err) {
      complete(err);
      return;
    }
    var getNextFile = function(nextPageToken) {
      wrapperThis.drive.files.list({
        pageSize: 2,
        pageToken: nextPageToken,
        q: '\'' + parentMeta.id + '\' in parents' + ' and trashed != true' +
           ' and mimeType != \'application/vnd.google-apps.folder\'',
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

              wrapperThis.downloadFile(file.id, path.join(targetDirectory, file.id + '-' + targetFileName), function(err, meta, targetFile) {
                if (!err) {
                  try { 
                    fs.appendFileSync(existingFileName, ',' + meta.id);
                    filesBeingDownloaded--;
                    checkGetNextFiles();
                  } catch (err) {
                    complete(new Error('Failed to append to existing file list'));
                    return;
                  }
                }  else {
                  // remove paritally written file if it exists
                  fs.unlink(targetFile, function() {
                    // do nothing on error
                  });
                  complete(err, targetFile);
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

gdriveWrapper.prototype.uploadNewFiles = function(gdriveDirectory, sourceDirectory, moveTo, complete) {
  const wrapperThis = this;
  this.getMetaForFilename(gdriveDirectory, function(err, parentMeta) {
    if (err) {
      complete(err);
      return;
    }
    fs.readdir(sourceDirectory, function(err, files) {
      if (err) {
        complete(err);
        return;
      }

      if (files.length === 0) {
        // no files to upload so just end
        complete(null);
        return;
      }

      var index = 0;
      var uploadNextFile = function(index) {
        var fileName = path.join(sourceDirectory, files[index]);
        var movetoName = path.join(moveTo, files[index]);
        if (fs.statSync(fileName).isFile()) {
          wrapperThis.uploadFile(files[index],
                                 fileName,
                                 {parent: parentMeta.id, compress: true, encrypt: true},
                                 function(err, meta) {
            if (err) {
              complete(err);
              return;
            }
            fs.rename(fileName, movetoName, function(err) {
              if (err) {
                complete(err);
                return;
              }
              index++;
              if (index < files.length) {
                uploadNextFile(index);
              }
            });
          });
        }
      }

      // start uploading the files
      uploadNextFile(0);
    });
  });
}

gdriveWrapper.prototype.getFileMetadata = function(fileId, complete) {
  output = this.drive.files.get({fileId: fileId}, complete);
}

module.exports = gdriveWrapper;
