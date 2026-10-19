import sharp from 'sharp';
const [source,destination]=process.argv.slice(2);if(!source||!destination)throw Error('Pass the source photograph and destination WebP');
await sharp(source).extract({left:981,top:995,width:320,height:180}).resize(640,360).webp({quality:94}).toFile(destination);
