const { Client } = require("@notionhq/client");
const { NotionToMarkdown } = require("notion-to-md");
const fs = require("fs");

require("dotenv").config();

// Notion API Key
const apiKey = process.env.NOTION_KEY;
// Notion Database ID
const databaseId = process.env.NOTION_DATABASE_ID;

const notion = new Client({
    auth: apiKey,
});

// passing notion client to the option
const n2m = new NotionToMarkdown({ notionClient: notion });

(async () => {
    // get all pages from the database
    const pages = await notion.databases.query({
        database_id: databaseId,
    });

    console.log(`Found ${pages.results.length} pages`);

    console.log(pages.results[0].properties);
    // properties keys are Object.keys(pages.results[0].properties);

    // get the frontmatter columns from the .env file, or use all the columns
    const frontmatter_cols = process.env.NOTION_FRONTMATTER_COLS
        ? process.env.NOTION_FRONTMATTER_COLS.split(",")
        : Object.keys(pages.results[0].properties);

    console.log("Frontmatter columns", frontmatter_cols);
    // loop through all pages
    for (const page of pages.results) {
        // Page Properties
        // get metadata columns
        const title = page.properties.title.title[0].plain_text;
        // const slug = page.properties.slug.rich_text[0].plain_text;

        // CUSTOMIZED FOR @Felix
        if (process.env.IS_FREEZE) {
            const isFrozen = page.properties[process.env.COL_FREEZE].checkbox;
            if (isFrozen) continue; // skip the page if it is frozen (i.e. not to be updated)
        }

        console.log(`--- Page ${title} ---`);
        // console.log(page.properties);

        // fetch all the page properties required for the frontmatter
        const frontmatter = {};
        for (const col of frontmatter_cols) {
            // get the type of the column
            const type = page.properties[col].type;
            // get the value of the column
            const value = page.properties[col][type];
            switch (type) {
                case "title": //fallthrough
                case "rich_text":
                    frontmatter[col] = value[0] ? value[0].plain_text : '""';
                    break;
                case "number": //fallthrough
                case "checkbox": // fallthrough
                    frontmatter[col] = value;
                    break;
                case "url":
                    frontmatter[col] = value != null ? value : '""';
                    break;
                case "date":
                    frontmatter[col] =
                        value != null ? `"${value.start}"` : '""';
                    break;
                case "multi_select":
                    frontmatter[col] = value.map((option) => option.name);
                    break;
                case "select":
                    frontmatter[col] = value.name;
                    break;

                default:
                    break;
            }
        }

        // console.log("Frontmatter", frontmatter);

        // Page Slug
        // if any key in frontmatter contains slug, Slug, or SLUG, use that
        // otherwise, use the title to generate the slug
        const slug = Object.keys(frontmatter).find((key) =>
            key.toLowerCase().includes("slug")
        )
            ? frontmatter[
                  Object.keys(frontmatter).find((key) =>
                      key.toLowerCase().includes("slug")
                  )
              ]
            : title
                  .toLowerCase()
                  .replace(/ _/g, "-")
                  .replace(/[^\w-]+/g, "");

        // console.log("Slug", slug);

        // turn the frontmatter into a string to be written to the file
        let frontmatterString = "---\n";
        for (const [key, value] of Object.entries(frontmatter)) {
            if (Array.isArray(value)) {
                frontmatterString += `${key}: [${value.join(", ")}]\n`;
                continue;
            }
            frontmatterString += `${key}: ${value}\n`;
        }
        frontmatterString += "---\n";

        // Page Content
        // get the page content
        // const pageContent = await notion.blocks.children.list({
        //     block_id: page.id,
        // });
        // console.log(pageContent);

        // convert the page content to markdown
        const mdblocks = await n2m.pageToMarkdown(page.id);
        const mdString = n2m.toMarkdownString(mdblocks);
        // console.log(mdString.parent);

        // combine the frontmatter and the markdown
        const postString = frontmatterString + mdString.parent;

        // Get the output directory from the terminal
        let OUTPUT_DIR =
            process.argv[2] || // TODO: implement this with flags
            process.env.OUTPUT_DIR ||
            "./output";
        // Customized for @Felix #2
        if (process.env.IS_LANG) {
            console.log("Multi-language mode detected...");
            const langCol = page.properties[process.env.COL_LANG].select;
            const lang = langCol ? langCol.name.toLowerCase() : "";
            const langDir = `${OUTPUT_DIR}/${lang}`;
            if (!fs.existsSync(langDir)) {
                fs.mkdirSync(langDir);
            }
            OUTPUT_DIR = langDir;
        }
        // write the markdown to a file
        fs.writeFile(`${OUTPUT_DIR}/${slug}.md`, postString, function (err) {
            if (err) return console.log(err);
            console.log(`Created ${slug}.md`);
        });
    }
})();
