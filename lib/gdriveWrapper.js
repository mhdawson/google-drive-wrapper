// Copyright 2016 the project authors as listed in the AUTHORS file.
// All rights reserved. Use of this source code is governed by the
// license that can be found in the LICENSE file.

var fs = require('fs');
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
      complete(null);
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
  this.getMetaForFilename('/backups/docker-images', function(err, parentMeta) {
    wrapperThis.drive.files.list({
      pageSize: 10,
      q: '\'' + parentMeta.id + '\' in parents',
      space: 'drive',
      fields: "nextPageToken, files(id, name)" },
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
        for (var i = 0; i < files.length; i++) {
          var file = files[i];
          console.log(file.id);
        }
      }
    );
  });
}

gdriveWrapper.prototype.getFileMetadata = function(fileId, complete) {
  output = this.drive.files.get({fileId: fileId}, complete);
}

module.exports = gdriveWrapper;
