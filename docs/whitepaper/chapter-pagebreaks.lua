-- Insert PDF page breaks before document chapters without polluting Markdown.
-- Applies to level-2 headings, excluding subtitle-like metadata headings near
-- the top of the document.

local excluded_titles = {
  ["Repenser le SDLC à l'âge des agents"] = true,
  ["Version management condensée"] = true,
}

local function stringify(inlines)
  return pandoc.utils.stringify(inlines)
end

function Header(header)
  if FORMAT ~= "latex" and FORMAT ~= "pdf" then
    return nil
  end

  if header.level ~= 2 then
    return nil
  end

  local title = stringify(header.content)
  if excluded_titles[title] then
    return nil
  end

  return {
    pandoc.RawBlock("latex", "\\newpage"),
    header,
  }
end
