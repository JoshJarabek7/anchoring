import { PurgeCSS } from "purgecss";
import fs from "fs";
import path from "path";

// Main processing function
const purge = async () => {
  const purgeCSSResults = await new PurgeCSS().purge({
    // Match all React components and HTML files
    content: [
      "./src/**/*.{js,jsx,ts,tsx}",
      "./index.html"
    ],
    // Target CSS files in source only
    css: ["./src/**/*.css"],
    // Use the default extractor plus one that can handle special TailwindCSS syntax
    defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || [],
    // Safelist only truly dynamic classes that might be added via JavaScript
    safelist: {
      // Only safelist specific dynamic classes that you know are used
      // Empty by default - add specific classes if needed
      standard: [],
      deep: [],
      greedy: []
    },
    // Remove unused font face declarations
    fontFace: true,
    // Remove unused @keyframes
    keyframes: true,
    // Remove unused CSS variables
    variables: true,
    // Skip node_modules to improve performance
    skippedContentGlobs: ["**/node_modules/**"]
  });

  // Output the results
  console.log("PurgeCSS completed!");
  console.log(`${purgeCSSResults.length} files processed.`);

  // Create optimized CSS files for production
  for (const result of purgeCSSResults) {
    // Get the original file name
    const fileName = path.basename(result.file);
    
    // Create an optimized version in a temp directory
    const outputDir = "./optimized-css";
    const outputPath = path.join(outputDir, fileName);
    
    // Ensure the directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write the purged CSS
    fs.writeFileSync(outputPath, result.css);
    console.log(`Optimized CSS written to ${outputPath}`);
  }

  return purgeCSSResults;
};

// Run the purge function
purge().catch(err => {
  console.error("Error running PurgeCSS:", err);
  process.exit(1);
});