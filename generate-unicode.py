import csv

with open('UnicodeData.txt', 'r') as f:
	reader = csv.reader(f, delimiter=';')

	print('// Adapted from http://www.unicode.org/Public/9.0.0/ucd/UnicodeData.txt')
	print('"use strict";')
	print()
	print('module.exports = {')

	for hexcode, name, category, _, _, _, _, _, _, _, alt_name, *_ in reader:
		if name == '<control>' and alt_name:
			name = alt_name

		print('0x{}: "{}",'.format(hexcode, name))

	print('};')
