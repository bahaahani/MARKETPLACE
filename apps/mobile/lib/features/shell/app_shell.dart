import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: l.navHome),
          NavigationDestination(icon: const Icon(Icons.directions_car_outlined), selectedIcon: const Icon(Icons.directions_car), label: l.navCars),
          NavigationDestination(icon: const Icon(Icons.apartment_outlined), selectedIcon: const Icon(Icons.apartment), label: l.navProperty),
          NavigationDestination(icon: const Icon(Icons.credit_card_outlined), selectedIcon: const Icon(Icons.credit_card), label: l.navCards),
          NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: l.navAccount),
        ],
      ),
    );
  }
}
