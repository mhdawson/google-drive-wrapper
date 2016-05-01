# google-drive-wrapper

Wrapper to simplify transferring files to/from google
drive.

The google-auth-wrapper ([npm]()/[github](https://github.com/mhdawson/google-auth-wrapper))
can be used to get the credentials required to access your google drive 
account.

By default it both compresses and encrypts files as they
are transferred to google drive.  If compressed/encrypted
they are decrypted/decompressed as they are download from
google drive. Before using please ensure you have validated that
the encryption is suitable for the data you are protecting
and that you have verified the implementation.

This modules provides these methods: 

* gdriveWrapper
* uploadFile
* downloadFile
* downloadNewFiles
* uploadNewFiles
* getMetaForFilename
* getFileMetaData 

As examples, the following use the uploadNewFiles and downloadNewFiles
methods (of course use your own passwords, not the ones shown!).  See
the info for 
[google-auth-wrapper](https://github.com/mhdawson/google-auth-wrapper)
for how to create the required 'client_secret.json' file:

Downloads all files in the google drive file 'backups' into the local
directory 'download':
<PRE>
var googleAuth = require('google-auth-wrapper');
var gdriveWrapper = require('./gdriveWrapper.js');

googleAuth.execute('./', 'client_secret', function(auth, google) {
  var wrapper = new gdriveWrapper(auth, google, 'goodpassword');
  wrapper.downloadNewFiles('backups', './download', function(err) {
    if(err) {
      console.log(err);
    }
  });
});
</PRE>

Uploads all files from the local directory 'upload' to the google
drive directory 'backups'.  Once transferred files are moved from
the 'upload' directory to the 'upload-done' directory.
<PRE>
var googleAuth = require('google-auth-wrapper');
var gdriveWrapper = require('./gdriveWrapper.js');

googleAuth.execute('./', 'client_secret', function(auth, google) {
  var wrapper = new gdriveWrapper(auth, google, 'goodpassword');
  wrapper.uploadNewFiles('backups', 'upload', 'upload-done', function(err) {
    if(err) {
      console.log(err);
    }
  });
});
</PRE>

# Methods

## gdriveWrapper

the gdriveWrapper is used to create a new wrapper instance that
can be used to invoke the other methods.  It takes the following
parameters:

* auth - googleAuth.OAuth2 object to be used to access the google services
* google - instance of googleapis to be used to access the google services
* password - password from which the key used to encrypt/decrypt the files
  will be derived.

## uploadFile

uploadFile takes the following arguments:

* filename - name of the file to be used in google drive
* sourceFile - name of the local file to be uploaded
* options - object as described below
* complete - function to be called when upload is complete
  or an error occurs.  The first parameter will err.  err
  will either be null if the upload was succesful or an 
  Error object with information as to why the upload
  failed.

The options object can optionally have the following fields:

* encrypt - if true file is encrypted, if false it is not. Default
  is to encrypt
* compress - if true file is compressed, if false it is not.  Default
  is to compress
* parent - google file id for the parent directory into which the
  file will be uploaded 
  
