-- Give Markdown tables explicit relative widths so Pandoc emits wrapping
-- LaTeX columns instead of unbounded l/c/r columns.

function Table(table)
  local column_count = #table.colspecs
  if column_count == 0 then
    return table
  end

  if column_count == 2 then
    table.colspecs[1] = { table.colspecs[1][1], 0.33 }
    table.colspecs[2] = { table.colspecs[2][1], 0.67 }
    return table
  end

  local width = 1 / column_count
  for index, colspec in ipairs(table.colspecs) do
    table.colspecs[index] = { colspec[1], width }
  end

  return table
end
