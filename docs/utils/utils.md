# General Utilities (`/utils/utils.js`)

This file contains general utility functions used across the application.

[Back to Utilities Overview](README.md)

## Functions

### `formatDate(dateStr)`

- **Description:** Parses a date string, assumed to be in "DD-MM-YYYY" format, into a standard JavaScript `Date` object.
- **Parameters:**
  - `dateStr` (String | null | undefined): The date string to parse.
- **Process:**
  1.  Checks if `dateStr` is provided.
  2.  If provided, splits the string by "-".
  3.  Attempts to convert the parts (day, month, year) to numbers.
  4.  If day, month, and year are all valid numbers, creates a new `Date` object using `new Date(year, month - 1, day)`. Note the month is 0-indexed in the `Date` constructor.
  5.  If `dateStr` is not provided or parsing fails (resulting in null/NaN for day, month, or year), sets the result to `null`.
- **Returns:**
  - (Date | null): A JavaScript `Date` object representing the parsed date, or `null` if the input string was invalid or could not be parsed into the expected format.
- **Usage:** Used in various controllers (e.g., [`studentController.js`](../controllers/studentController.md)) to handle date inputs.
- **Example:**
  ```javascript
  formatDate("25-12-2023") // Returns Date object for Dec 25, 2023
  formatDate("32-12-2023") // Returns null (invalid day)
  formatDate(null) // Returns null
  formatDate("2023-12-25") // Returns null (incorrect format)
  ```
