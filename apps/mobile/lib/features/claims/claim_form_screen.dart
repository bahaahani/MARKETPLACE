import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/models/config.dart';
import '../../core/models/insurance.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.g.dart';
import '../../widgets/common.dart';
import '../insurance/insurance_providers.dart';
import 'claims_models.dart';
import 'claims_providers.dart';

/// "I had an accident" (J6): First Notice of Loss on an active motor policy. Mirrors /{locale}/claims/new on the web.
/// Options and limits come from GET /config; the API validates everything (no rules in Dart).
class ClaimFormScreen extends ConsumerWidget {
  const ClaimFormScreen({super.key, this.policyId, this.plate});
  final String? policyId;
  final String? plate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final policies = ref.watch(myPoliciesProvider);
    final config = ref.watch(configProvider);
    final AsyncValue<(List<Policy>, ClientConfig)> both = switch ((policies, config)) {
      (AsyncData(value: final p), AsyncData(value: final c)) => AsyncData((p, c)),
      (AsyncError(:final error, :final stackTrace), _) || (_, AsyncError(:final error, :final stackTrace)) => AsyncError(error, stackTrace),
      _ => const AsyncLoading(),
    };
    return Scaffold(
      appBar: AppBar(title: Text(l.claimNewTitle), actions: const [LanguageButton()]),
      body: AsyncView<(List<Policy>, ClientConfig)>(
        value: both,
        onRetry: () {
          ref.invalidate(myPoliciesProvider);
          ref.invalidate(configProvider);
        },
        data: (loaded) {
          final motor = [for (final p in loaded.$1) if (p.line == 'motor' && p.active) p];
          if (motor.isEmpty) {
            return ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
              Card(
                key: const Key('claim-no-policy'),
                child: Padding(
                  padding: const EdgeInsets.all(SahelSpace.md),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text(l.claimNoMotorPolicy),
                    const SizedBox(height: SahelSpace.sm),
                    FilledButton(onPressed: () => context.push('/insurance'), child: Text(l.claimGetMotorCover)),
                  ]),
                ),
              ),
            ]);
          }
          final initial = motor.where((p) => p.id == policyId).firstOrNull ?? motor.where((p) => p.cover.reference == plate).firstOrNull ?? motor.first;
          return _ClaimForm(policies: motor, initialPolicyId: initial.id, rules: loaded.$2.claims);
        },
      ),
    );
  }
}

class _ClaimForm extends ConsumerStatefulWidget {
  const _ClaimForm({required this.policies, required this.initialPolicyId, required this.rules});
  final List<Policy> policies;
  final String initialPolicyId;
  final ClaimRules rules;

  @override
  ConsumerState<_ClaimForm> createState() => _ClaimFormState();
}

class _ClaimFormState extends ConsumerState<_ClaimForm> {
  late String _policyId = widget.initialPolicyId;
  late String _type = widget.rules.types.first;
  late String _severity = widget.rules.severities.length > 1 ? widget.rules.severities[1] : widget.rules.severities.first;
  DateTime _incidentAt = DateTime.now();
  bool _thirdParty = false;
  final _location = TextEditingController();
  final _description = TextEditingController();
  final _policeReport = TextEditingController();
  final _photos = <ClaimPhotoUpload>[];
  bool _busy = false;
  String? _error;

  // One key per form: a retry after a network error files the claim only once.
  final _idempotencyKey = 'claim-${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 32)}';

  @override
  void dispose() {
    _location.dispose();
    _description.dispose();
    _policeReport.dispose();
    super.dispose();
  }

  Future<void> _pickDateTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(context: context, initialDate: _incidentAt, firstDate: now.subtract(const Duration(days: 366)), lastDate: now);
    if (date == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_incidentAt));
    if (time == null || !mounted) return;
    setState(() => _incidentAt = DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  Future<void> _addPhotos({required bool camera}) async {
    final rules = widget.rules;
    final room = rules.maxPhotos - _photos.length;
    if (room <= 0) return;
    setState(() => _error = null);
    try {
      final picked = await ref.read(claimPhotoPickerProvider).pick(camera: camera, maxDimensionPx: rules.photoMaxDimensionPx, limit: room);
      if (!mounted) return;
      // The size limit comes from /config; the API checks size and type again.
      final fitting = [for (final p in picked) if (p.bytes.length <= rules.maxPhotoBytes) p];
      setState(() {
        _photos.addAll(fitting.take(room));
        if (fitting.length < picked.length) _error = context.l10n.claimErrorPhoto;
      });
    } catch (_) {
      if (mounted) setState(() => _error = context.l10n.claimErrorPhoto);
    }
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final report = _policeReport.text.trim();
    try {
      final claim = await ref.read(repositoryProvider).fileClaim(
            ClaimDraft(
              policyId: _policyId,
              incidentAt: _incidentAt,
              location: _location.text,
              type: _type,
              severity: _severity,
              description: _description.text,
              thirdPartyInvolved: _thirdParty,
              policeReportNumber: report.isEmpty ? null : report,
              photos: List.of(_photos),
            ),
            idempotencyKey: _idempotencyKey,
          );
      ref.invalidate(myClaimsProvider);
      if (mounted) context.pushReplacement('/claims/${claim.id}');
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = claimErrorText(context.l10n, e);
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final rules = widget.rules;
    final policeRequired = rules.policeReportRequiredFor.contains(_type);
    final time = TimeOfDay.fromDateTime(_incidentAt).format(context);
    return ListView(padding: const EdgeInsets.all(SahelSpace.md), children: [
      Text(l.claimNewSubtitle, style: const TextStyle(color: SahelColors.textMuted)),
      const SizedBox(height: SahelSpace.md),
      DropdownButtonFormField<String>(
        key: const Key('claim-policy'),
        initialValue: _policyId,
        isExpanded: true,
        decoration: InputDecoration(labelText: l.claimPolicy),
        items: [
          for (final p in widget.policies)
            DropdownMenuItem(
              value: p.id,
              child: Text(l.claimPolicyOption(context.loc(p.insurerName), p.cover.reference ?? '', p.policyNumber), overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: (v) => setState(() => _policyId = v ?? _policyId),
      ),
      SectionHeader(l.claimType),
      Wrap(spacing: 8, runSpacing: 4, children: [
        for (final t in rules.types)
          ChoiceChip(key: Key('claim-type-$t'), label: Text(claimTypeLabel(l, t)), selected: _type == t, onSelected: (_) => setState(() => _type = t)),
      ]),
      SectionHeader(l.claimSeverity),
      Wrap(spacing: 8, runSpacing: 4, children: [
        for (final s in rules.severities)
          ChoiceChip(
              key: Key('claim-severity-$s'), label: Text(claimSeverityLabel(l, s)), selected: _severity == s, onSelected: (_) => setState(() => _severity = s)),
      ]),
      const SizedBox(height: SahelSpace.md),
      ListTile(
        key: const Key('claim-incident-at'),
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.event),
        title: Text(l.claimIncidentAt),
        subtitle: Text('${context.date(_incidentAt)} · $time'),
        onTap: _pickDateTime,
      ),
      TextField(
        key: const Key('claim-location'),
        controller: _location,
        maxLength: rules.locationMaxLength,
        decoration: InputDecoration(labelText: l.claimLocation, hintText: l.claimLocationPlaceholder),
      ),
      TextField(
        key: const Key('claim-description'),
        controller: _description,
        minLines: 3,
        maxLines: 6,
        maxLength: rules.descriptionMaxLength,
        decoration: InputDecoration(
          labelText: l.claimDescription,
          helperText: l.claimDescriptionHint('${rules.descriptionMinLength}', '${rules.descriptionMaxLength}'),
        ),
      ),
      TextField(
        key: const Key('claim-police-report'),
        controller: _policeReport,
        maxLength: rules.policeReportMaxLength,
        textDirection: TextDirection.ltr,
        decoration: InputDecoration(labelText: policeRequired ? l.claimPoliceReportRequired : l.claimPoliceReportOptional),
      ),
      SwitchListTile(
        key: const Key('claim-third-party'),
        contentPadding: EdgeInsets.zero,
        title: Text(l.claimThirdParty),
        value: _thirdParty,
        onChanged: (v) => setState(() => _thirdParty = v),
      ),
      SectionHeader(l.claimPhotos),
      Text(l.claimPhotosHint('${rules.maxPhotos}'), style: const TextStyle(color: SahelColors.textMuted, fontSize: 12)),
      const SizedBox(height: SahelSpace.sm),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final (i, p) in _photos.indexed)
          Stack(key: Key('claim-photo-$i'), clipBehavior: Clip.none, children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(SahelRadius.sm),
              child: Image.memory(p.bytes, width: 80, height: 80, fit: BoxFit.cover, semanticLabel: l.claimPhotoAlt('${i + 1}'),
                  errorBuilder: (_, _, _) => Container(width: 80, height: 80, color: SahelColors.background, child: const Icon(Icons.image))),
            ),
            PositionedDirectional(
              top: -8,
              end: -8,
              child: IconButton.filled(
                key: Key('claim-photo-remove-$i'),
                iconSize: 14,
                visualDensity: VisualDensity.compact,
                tooltip: l.claimPhotoRemove('${i + 1}'),
                onPressed: () => setState(() => _photos.removeAt(i)),
                icon: const Icon(Icons.close),
              ),
            ),
          ]),
      ]),
      Wrap(children: [
        TextButton.icon(
          key: const Key('claim-photos-gallery'),
          onPressed: _photos.length >= rules.maxPhotos ? null : () => _addPhotos(camera: false),
          icon: const Icon(Icons.photo_library_outlined),
          label: Text(l.claimPhotosGallery),
        ),
        TextButton.icon(
          key: const Key('claim-photos-camera'),
          onPressed: _photos.length >= rules.maxPhotos ? null : () => _addPhotos(camera: true),
          icon: const Icon(Icons.photo_camera_outlined),
          label: Text(l.claimPhotosCamera),
        ),
      ]),
      Text(l.claimPhotosCount('${_photos.length}', '${rules.maxPhotos}'), key: const Key('claim-photo-count'), style: const TextStyle(fontSize: 12)),
      Text('⚠️ ${l.claimPhotosSandboxNote}', style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
      const SizedBox(height: SahelSpace.md),
      if (_error != null) Text(_error!, key: const Key('claim-error'), style: const TextStyle(color: SahelColors.danger)),
      const SizedBox(height: SahelSpace.sm),
      FilledButton(key: const Key('claim-submit'), onPressed: _busy ? null : _submit, child: Text(_busy ? l.claimSubmitting : l.claimSubmit)),
      const SizedBox(height: SahelSpace.sm),
      Text('⚠️ ${l.claimSandboxNote}', style: const TextStyle(color: SahelColors.textMuted, fontSize: 11)),
    ]);
  }
}
