# google-drive-wrapper

Wrapper to simplify transferring files to/from google
drive.

The npm google-auth-wrapper
([npm](https://www.npmjs.com/package/google-auth-wrapper)/
[github](https://github.com/mhdawson/google-auth-wrapper))
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

They allow individual files to be uploaded/download and the contents
of directories to be uploaded and downloaded. On upload they allow
a file to be converted into a google doc format for sharing/editing
in the same manner as any other googlo doc.

As examples, the following use the uploadNewFiles, downloadNewFiles
and uploadFile methods (of course use your own passwords,
not the ones shown!).  See the info for 
[google-auth-wrapper](https://github.com/mhdawson/google-auth-wrapper)
for how to create the required 'client_secret.json' and 
'client_secret.token' files:

This example downloads all files in the google drive file 'backups' into the local
directory 'download':
<PRE>
var googleAuth = require('google-auth-wrapper');
var gdriveWrapper = require('google-drive-wrapper');

googleAuth.execute('./', 'client_secret', function(auth, google) {
  var wrapper = new gdriveWrapper(auth, google, 'goodpassword');
  wrapper.downloadNewFiles('backups', './download', function(err) {
    if(err) {
      console.log(err);
    }
  });
});
</PRE>

This example uploads all files from the local directory 'upload' to the google
drive directory 'backups'.  Once transferred files are moved from
the 'upload' directory to the 'upload-done' directory.
<PRE>
var googleAuth = require('google-auth-wrapper');
var gdriveWrapper = require('google-drive-wrapper');

googleAuth.execute('./', 'client_secret', function(auth, google) {
  var wrapper = new gdriveWrapper(auth, google, 'goodpassword');
  wrapper.uploadNewFiles('backups', 'upload', 'upload-done', function(err) {
    if(err) {
      console.log(err);
    }
  });
});
</PRE>

This example uploads a text file and specifies that it should be converted
into a google doc document that can be edited online like any other google
doc:

<PRE>
var googleAuth = require('google-auth-wrapper');
var gdriveWrapper = require('google-drive-wrapper');


googleAuth.execute('./', 'client_secret', function(auth, google) {
  var wrapper = new gdriveWrapper(auth, google, 'goodpassword');

  wrapper.getMetaForFilename('/backups/docker-images', function(err, parentMeta) {
    if (err !== null) {
      console.log('Invalid directory path');
    }
    wrapper.uploadFile('testdoc', 'testdoc.txt',
                       {parent: parentMeta.id, compress: false, encrypt: false,
                        convert: true, mimeType: 'application/vnd.google-apps.document'},
                       function(err, meta) {
      if (err !== null) {
        console.log('Failed to upload file');
      } else {
        console.log('Sharable link: https://drive.google.com/open?id=' + meta.id);
      }
    });
  });
});
</PRE>

We need to disable both compression and encryption as we want the file to be
plaintext so it can be converted.  We then need to specify 'convert: true' so 
that the file will be converted on upload, and then we need to specify
the mimeType for the type we want it to be convered to.  In the case of the
example we use 'application/vnd.google-apps.document' to ask that it be
converted to a google gdoc document.

# Methods

## gdriveWrapper

gdriveWrapper is used to create a new wrapper instance that
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
  or an error occurs.  The first parameter will be err.  err
  will either be null if the upload was succesful or an 
  Error object with information as to why the upload
  failed. If successful the second parameter will be the
  google meta object for the file uploaded.

The options object can optionally have the following fields:

* encrypt - if true file is encrypted, if false it is not. Default
  is to encrypt
* compress - if true file is compressed, if false it is not.  Default
  is to compress
* parent - google file id for the parent directory into which the
  file will be uploaded 
* convert - set to true to ask that the file be converted to
  a google doc on uploaded (optional, default is not to convert)
* mimeType - mime type for the type of google doc that the file
  should be converted to if 'convert: true' was specified (required
  if convert is set to true, otherwise ignored)

## downloadFile

downloadFile takes the following arguments:

* filedId - google id of the file to be downloaded.  You can get this
  id for a particular path using getMetaForFileName()
* destFilename - name for the file on the local filesystem
* complete - function to be called when download is complete
  or an error occurs.  The first parameter will be err.  err
  will either be null if the download was succesful or an
  Error object with information as to why the downlaod
  failed. If successful the second paratmer will be the
  google meta object for the file downloaded.
  
If the name of the file with the specified google Id
ends with the '.enc' file extension downloadFile will
attempt to decrypt during the download. Similarly if the file
ends with '.gz.enc' or '.gz' then downloadFile will attempt
decompress the file during the download. (Its still a TODO to make
this optional).  If decrypted and/or decompressed the '.enc'
and/or '.gz' extensions will be removed.


## downloadNewFiles

Downloads all of the files from the specific google
drive folder to a local directory. 
downloadNewFiles uses a file called '.existing' in the
local download directory to track files by their
google file id.  Once downloaded succesfully the
file will not be downloaded again unless you specify
a different local download directory or deleete
the '.existing' file in the local download directory.

The download files will be named both by their file
name in from the file metadata as well as the google
file id.  This is required because multiple files
in the same folder can have the same file name in the
meta data.  The local files are named as:

<PRE>
  fileid-filename
</PRE>

each file will be decrypted and or decompressed
based on its file name as described for downloadFile()
above.

downloadNewFiles takes the following arguments:

* gdriveDirectory - directory path in google drive, this will
  be converted to a google drive file id by getMetaForFilename()
* targetDirectory - the local directory to which files will
  be downloaded
* complete - function to be called when download is complete
  or an error occurs.  The first parameter will be err.  err
  will either be null if the download was succesful or an
  Error object with information as to why the downlaod
  failed. If there was an error, if available the second
  parameter will be the fileName associated with the error

## uploadNewFiles

Uploads all files from a local directory in to a folder in
google drive.  

As files are uploaded each file will be encrypted and or
compressed as described for uploadFile() above.  (still
a TODO to make this optional for uploadNewFiles()).

uploadNewFiles takes the following arguments:

* gdriveDirectory - folder in google drive to uplaod files into
  will be converted into google file id using 
  getMetaForFileName().
* sourceDirectory - local directory with the files to upload
* moveTo - directory to which files are moved to after they
  have been uploaded.  Once the upload is complete the result
  is that all of the files in sourceDirectory should have been
  uploaded and moved to the moveTo directory
* complete - function to be called when upload is complete
  or an error occurs.  The first parameter will be err.  err
  will either be null if the upload was succesful or an
  Error object with information as to why the upload
  failed.

## getMetaForFilename

Converts a path like name to a google file id.  Finds the
google file id for each segment and then limits search in
next segement to the the file id for the previous segment.
It will find the fist occurance of a file whoes filename 
matches a segment.  Since multiple files with the same
parent can have the same filename in their metadata
this may not always get the file you expect.  It is up to
you to make sure you manage the naming of the parents
so that the name you pass in will resolve to the expected
google file id.  For example if you resolve:

<PRE>
/level1/level2
</PRE>

you will need to make sure that only one file has the
filename 'level1' at the root of your drive and that
only one child of 'level1' is named 'level2'.

getMetaForFilename takes the following arguments:

* filename - path like file name to be resolved
* complete - function to be called when resolution is
  complete or an error occurs  The first parameter will
  be err.  err will either be null if the resolution
  was succesful or an Error object with information
  as to why the resolution failed. If there is an
  error then if available, the second parameter
  will be the file that the meta was requested for.
  If successful the second parameter will be the
  google drive metadata object for file matching
  the file specified.

##  getFileMetaData 

Returns the metadata for a file give the google
drive file id.

getFileMetaData takes the following arguments:

* fileId - file id for the file
* complete - function to be called when resolution is
  complete or an error occurs  The first parameter will
  be err.  err will either be null if the resolution
  was succesful or an Error object with information
  as to why the resolution failed. If successful
  the second parameter will be the google drive
  metadata object for file matching the file specified.

