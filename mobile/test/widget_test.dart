import 'package:flutter_test/flutter_test.dart';
import 'package:sadhai_coffee/theme.dart';

void main() {
  test('rs formats NPR with Indian grouping', () {
    expect(rs(130), 'Rs 130');
    expect(rs(1200), 'Rs 1,200');
    expect(rs(125000), 'Rs 1,25,000');
  });
}
