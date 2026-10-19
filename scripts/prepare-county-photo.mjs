import sharp from 'sharp';
const [source,destination]=process.argv.slice(2);
if(!source||!destination)throw Error('Pass source photograph and output WebP path');
await sharp(source).resize({width:3072,withoutEnlargement:true}).webp({quality:90}).toFile(destination);
